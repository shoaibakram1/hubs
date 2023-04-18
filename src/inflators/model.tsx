import { GraphJSON, ValueJSON } from "@oveddan-behave-graph/core";
import { addComponent, addEntity, hasComponent } from "bitecs";
import { Material, Object3D } from "three";
import { HubsWorld } from "../app";
import { BehaviorGraph, GLTFModel, MaterialTag, MixerAnimatable } from "../bit-components";
import { addMaterialComponent, addObject3DComponent, gltfInflatorExists, gltfInflators } from "../utils/jsx-entity";
import { mapMaterials } from "../utils/material-utils";
import { EntityID } from "../utils/networking-types";

function camelCase(s: string) {
  return s.replace(/-(\w)/g, (_, m) => m.toUpperCase());
}

export type ModelParams = { model: Object3D };

// These components are all handled in some special way, not through inflators
const ignoredComponents = ["visible", "frustum", "frustrum", "shadow", "networked"];

function inflateComponents(
  world: HubsWorld,
  eid: number,
  components: { [componentName: string]: any },
  idx2eid: Map<number, EntityID>
) {
  Object.keys(components).forEach(name => {
    const inflatorName = camelCase(name);
    if (ignoredComponents.includes(inflatorName)) return;
    if (!gltfInflatorExists(inflatorName)) {
      console.warn(`Failed to inflate unknown component called ${inflatorName}`, components[name]);
      return;
    }

    const props = components[name];
    Object.keys(props).forEach(propName => {
      const value = props[propName];
      const linkType = value?.__mhc_link_type;
      if (linkType) {
        if (linkType !== "node") {
          throw new Error("Non node link types should be resolved before inflateModel is called");
        }
        const existingEid = idx2eid.get(value.index);
        if (existingEid) {
          props[propName] = existingEid;
        } else {
          props[propName] = addEntity(world);
          idx2eid.set(value.index, props[propName]);
        }
      }
    });
    gltfInflators[inflatorName](world, eid, props);
  });
}

// TODO we are doing this in a bunch of different ways. It should all be able to be unified. For BG though this will likely be JSON paths
type MHCLink = { __mhc_link_type?: "node" | "material"; index: number; dep: Material };
function resolveBGMHCLink(
  world: HubsWorld,
  value: MHCLink,
  idx2eid: Map<number, EntityID>,
  matIdx2eid: Map<number, EntityID>
): ValueJSON {
  const linkType = value?.__mhc_link_type;
  if (linkType) {
    if (linkType === "node") {
      return idx2eid.get(value.index)!;
    } else if (linkType === "material") {
      if (!matIdx2eid.has(value.index)) {
        const mat = value.dep;
        if (!mat.eid) {
          mat.eid = addEntity(world);
          addMaterialComponent(world, mat.eid, mat);
          const components = mat.userData.gltfExtensions?.MOZ_hubs_components;
          if (components) inflateComponents(world, mat.eid, components, idx2eid);
        }
        matIdx2eid.set(mat.userData.gltfIndex, mat.eid);
      }
      return matIdx2eid.get(value.index)!;
    } else {
      throw new Error(`${linkType} links not suppoerted`);
    }
  } else {
    return value as any;
  }
}

export function inflateModel(world: HubsWorld, rootEid: number, { model }: ModelParams) {
  const swap = new Map<Object3D, Object3D>();
  const idx2eid = new Map<number, number>();
  const matIdx2eid = new Map<number, number>();
  model.traverse(obj => {
    const gltfIndex: number | undefined = obj.userData.gltfIndex;

    let eid: number;
    if (obj === model) {
      eid = rootEid;
    } else if (gltfIndex !== undefined && idx2eid.has(gltfIndex)) {
      eid = idx2eid.get(gltfIndex)!;
    } else {
      eid = addEntity(world);
    }

    if (gltfIndex !== undefined) idx2eid.set(gltfIndex, eid);

    const components = obj.userData.gltfExtensions?.MOZ_hubs_components;
    if (components) inflateComponents(world, eid, components, idx2eid);

    mapMaterials(obj, function (mat: Material) {
      const eid = mat.eid || addEntity(world);
      matIdx2eid.set(mat.userData.gltfIndex, eid);
      if (!hasComponent(world, MaterialTag, eid)) addMaterialComponent(world, eid, mat);
      const components = mat.userData.gltfExtensions?.MOZ_hubs_components;
      if (components) inflateComponents(world, eid, components, idx2eid);
    });

    const replacement = world.eid2obj.get(eid);
    if (replacement) {
      if (obj.type !== "Object3D") {
        console.error(obj, replacement);
        throw new Error("Failed to inflate model. Unexpected object type found before swap.");
      }
      if (obj === model) {
        throw new Error("Failed to inflate model. Can't inflate alternative object type on root scene.");
      }
      swap.set(obj, replacement);
    } else {
      addObject3DComponent(world, eid, obj);
    }
  });

  for (const [old, replacement] of swap) {
    for (let i = old.children.length - 1; i >= 0; i--) {
      replacement.add(old.children[i]);
    }
    replacement.position.copy(old.position);
    replacement.quaternion.copy(old.quaternion);
    replacement.scale.copy(old.scale);
    replacement.matrixNeedsUpdate = true;
    // Re-use the the uuid for animation targeting.
    // TODO: This is weird... Should we be rewriting the animations instead?
    replacement.uuid = old.uuid;

    old.parent!.add(replacement);
    old.removeFromParent();
  }

  // These components are special because we want to do a one-off action
  // that we can't do in a regular inflator (because they depend on the object3D).
  // If more things need to run at this point, we may need to expand the api here.
  model.traverse(obj => {
    const components = obj.userData.gltfExtensions?.MOZ_hubs_components || {};
    if (components.visible) {
      const { visible } = components.visible;
      obj.visible = visible;
    }

    if (components.shadow) {
      const { cast, receive } = components.shadow;
      obj.traverse(o => {
        o.castShadow = cast;
        o.receiveShadow = receive;
      });
    }

    // We have had both spellings at different times.
    if (components.frustrum) {
      components.frustum = components.frustrum;
    }

    if (components.frustum) {
      const { culled } = components.frustum;
      obj.traverse(o => {
        o.frustumCulled = culled;
      });
    }
  });

  if (model.userData.behaviorGraph) {
    const graph = model.userData.behaviorGraph as GraphJSON;
    for (const node of graph.nodes!) {
      if (node.configuration) {
        for (const propName in node.configuration) {
          node.configuration[propName] = resolveBGMHCLink(
            world,
            node.configuration[propName] as any,
            idx2eid,
            matIdx2eid
          );
        }
      }
      if (node.parameters) {
        for (const propName in node.parameters) {
          const param = node.parameters[propName];
          if ("value" in param) {
            param.value = resolveBGMHCLink(world, param.value as any, idx2eid, matIdx2eid);
          }
        }
      }
    }
    addComponent(world, BehaviorGraph, rootEid);
  }

  addComponent(world, GLTFModel, rootEid);
  addComponent(world, MixerAnimatable, rootEid);
}

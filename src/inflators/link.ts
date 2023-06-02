import { addComponent } from "bitecs";
import { Link } from "../bit-components";
import { HubsWorld } from "../app";

export enum LinkType {
  LINK = 0,
  AVATAR = 1,
  SCENE = 2,
  LOCAL_ROOM = 3,
  EXTERNAL_ROOM = 4,
  WAYPOINT = 5
}

export type LinkParams = {
  href: string;
  type?: LinkType;
};

export function inflateLink(world: HubsWorld, eid: number, params: LinkParams): number {
  addComponent(world, Link, eid);
  Link.url[eid] = APP.getSid(params.href);
  Link.type[eid] = params.type || LinkType.LINK;
  return eid;
}

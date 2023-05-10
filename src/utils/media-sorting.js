import { faVideo } from "@fortawesome/free-solid-svg-icons/faVideo";
import { faMusic } from "@fortawesome/free-solid-svg-icons/faMusic";
import { faImage } from "@fortawesome/free-solid-svg-icons/faImage";
import { faNewspaper } from "@fortawesome/free-solid-svg-icons/faNewspaper";
import { faQuestion } from "@fortawesome/free-solid-svg-icons/faQuestion";
import { faCube } from "@fortawesome/free-solid-svg-icons/faCube";
import { hasComponent } from "bitecs";
import { GLTFModel, MediaImage, MediaPDF, MediaVideo } from "../bit-components";

export const SORT_ORDER_VIDEO = 0;
export const SORT_ORDER_AUDIO = 1;
export const SORT_ORDER_IMAGE = 2;
export const SORT_ORDER_PDF = 3;
export const SORT_ORDER_MODEL = 4;
export const SORT_ORDER_UNIDENTIFIED = 5;

export function mediaSortOrder(elOrEid) {
  if (!elOrEid.isEntity) {
    if (hasComponent(APP.world, MediaVideo)) {
      const contentTypeSid = MediaVideo.contentType[elOrEid];
      const contentType = APP.getString(contentTypeSid);
      if (contentType.startsWith("audio/")) {
        return SORT_ORDER_AUDIO;
      } else {
        return SORT_ORDER_VIDEO;
      }
    }
    if (hasComponent(APP.world, MediaImage)) return SORT_ORDER_IMAGE;
    if (hasComponent(APP.world, MediaPDF)) return SORT_ORDER_PDF;
    if (hasComponent(APP.world, GLTFModel)) return SORT_ORDER_MODEL;
  } else {
    if (elOrEid.components["media-video"] && elOrEid.components["media-video"].data.contentType.startsWith("audio/")) {
      return SORT_ORDER_AUDIO;
    }
    if (elOrEid.components["media-video"]) return SORT_ORDER_VIDEO;
    if (elOrEid.components["media-image"]) return SORT_ORDER_IMAGE;
    if (elOrEid.components["media-pdf"]) return SORT_ORDER_PDF;
    if (elOrEid.components["gltf-model-plus"]) return SORT_ORDER_MODEL;
  }
  return SORT_ORDER_UNIDENTIFIED;
}

export function mediaSort(elOrEid1, elOrEid2) {
  return mediaSortOrder(elOrEid1) - mediaSortOrder(elOrEid2);
}

export const DISPLAY_IMAGE = new Map([
  [SORT_ORDER_VIDEO, faVideo],
  [SORT_ORDER_AUDIO, faMusic],
  [SORT_ORDER_IMAGE, faImage],
  [SORT_ORDER_PDF, faNewspaper],
  [SORT_ORDER_UNIDENTIFIED, faQuestion],
  [SORT_ORDER_MODEL, faCube]
]);

const SORT_ORDER_TO_TYPE = {
  [SORT_ORDER_VIDEO]: "video",
  [SORT_ORDER_AUDIO]: "audio",
  [SORT_ORDER_IMAGE]: "image",
  [SORT_ORDER_PDF]: "pdf",
  [SORT_ORDER_MODEL]: "model"
};

export function getMediaType(elOrEid) {
  const order = mediaSortOrder(elOrEid);
  return SORT_ORDER_TO_TYPE[order];
}

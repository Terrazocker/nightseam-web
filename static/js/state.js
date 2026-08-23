/* global application state */

export const IMG_VER = 2;   // bump to make browsers refetch object images

export const S = {
  cfg: null,          // /api/state
  catalog: [],        // catalog meta
  meta: {},           // id -> meta
  night: null,        // computed night (raw tracks; derived flags live on objects)
  tIdx: 0,            // scrub index
  filteredIds: [],
  currentId: null,
  minAlt: 25,
  panos: [],          // full panorama records incl profile
  catmode: false,     // Image Archive mode active
  library: null,      // /api/library
};

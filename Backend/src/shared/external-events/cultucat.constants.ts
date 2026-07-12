export const DEFAULT_CULTUCAT_TIMEOUT_MS = 5000;
export const DEFAULT_CULTUCAT_EVENT_MAX_DISTANCE_KM = 2;

// CultuCat event `imageUrl` values are relative Adobe Experience Manager
// asset paths (e.g. "/content/dam/agenda/..."), served by the Generalitat
// de Catalunya's cultural agenda. Prefix this host to get a usable absolute
// URL. Same in every environment, so a constant rather than an env var.
export const CULTUCAT_IMAGE_BASE_URL = 'https://agenda.cultura.gencat.cat';

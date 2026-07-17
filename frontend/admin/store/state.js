// Admin state shape + initial state
export const initialAdminState = {
  // Config form
  configRevision: 0,
  configAddr: "",
  configMusicDirs: [],
  configBannedIPs: [],
  configScanWorkers: 16,
  configKeycloakEnabled: false,
  configKeycloakIssuer: "",
  configKeycloakClientID: "",
  configKeycloakClientSecret: "",
  configKeycloakDisplayName: "Keycloak",

  // Rooms
  rooms: [
    {
      id: "main",
      name: "Public Room",
      adminGroups: [],
      grants: { everyone: ["queue_add", "queue_manage", "playback_control"] },
    },
  ],
  roomCounter: 1,

  // Scan status
  scanStatus: null,
  scanStatusTimer: 0,

  // UI feedback
  saveFeedbackTimer: 0,
  configStatus: { message: "", kind: "" },
  rescanStatus: { message: "", kind: "" },
};

export function createAdminStore(initialOverrides = {}) {
  const state = { ...initialAdminState, ...initialOverrides };
  return state;
}
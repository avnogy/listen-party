// Admin derived state selectors
export const adminSelectors = {
  configRevision: (state) => state.configRevision,
  configAddr: (state) => state.configAddr,
  configMusicDirs: (state) => state.configMusicDirs,
  configBannedIPs: (state) => state.configBannedIPs,
  configScanWorkers: (state) => state.configScanWorkers,
  configKeycloakEnabled: (state) => state.configKeycloakEnabled,
  configKeycloakIssuer: (state) => state.configKeycloakIssuer,
  configKeycloakClientID: (state) => state.configKeycloakClientID,
  configKeycloakClientSecret: (state) => state.configKeycloakClientSecret,
  configKeycloakDisplayName: (state) => state.configKeycloakDisplayName,

  rooms: (state) => state.rooms,
  roomCounter: (state) => state.roomCounter,

  scanStatus: (state) => state.scanStatus,
  scanStatusTimer: (state) => state.scanStatusTimer,

  saveFeedbackTimer: (state) => state.saveFeedbackTimer,
  configStatus: (state) => state.configStatus,
  rescanStatus: (state) => state.rescanStatus,

  // Derived
  hasMusicDirs: (state) => state.configMusicDirs.length > 0,
  hasBannedIPs: (state) => state.configBannedIPs.length > 0,
  scanning: (state) => state.scanStatus?.scanning === true,
};
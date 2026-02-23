declare module '@portal/cloud-backup-android' {
  const module: {
    backupSeed(seedData: string, fileName: string): Promise<string>;
    restoreSeed(fileName: string): Promise<string>;
    isAvailable?(): Promise<boolean>;
  };
  export default module;
}

declare module '@portal/cloud-backup-ios' {
  const module: {
    backupSeed(seedData: string, fileName: string): Promise<string>;
    restoreSeed(fileName: string): Promise<string>;
    isAvailable?(): Promise<boolean>;
  };
  export default module;
}

module.exports = {
  resolveSnapshotPath: (testPath, snapshotExtension) => {
    return testPath.replace(/\.spec\.ts$/, snapshotExtension);
  },
  resolveTestPath: (snapshotPath, snapshotExtension) => {
    return snapshotPath.replace(snapshotExtension, '.spec.ts');
  },
  testPathForConsistencyCheck: 'some/example.spec.ts',
};

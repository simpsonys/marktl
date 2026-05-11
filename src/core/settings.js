function firstString(...values) {
  for (const value of values) {
    if (typeof value === 'string' && value.trim()) {
      return value.trim();
    }
  }
  return '';
}

function migrateSettings(defaultSettings, rawSettings) {
  const raw = rawSettings && typeof rawSettings === 'object' ? rawSettings : {};
  const settings = Object.assign({}, defaultSettings, raw);
  let migrated = false;

  const legacyRepo = firstString(raw.githubRepository, raw.repository);
  if (!firstString(settings.githubRepo) && legacyRepo) {
    settings.githubRepo = legacyRepo;
    migrated = true;
  }

  const legacyPublishPath = firstString(raw.publishPath, raw.githubPath);
  if (
    (!firstString(settings.githubPublishPath) || settings.githubPublishPath === defaultSettings.githubPublishPath)
    && legacyPublishPath
  ) {
    settings.githubPublishPath = legacyPublishPath;
    migrated = true;
  }

  const legacyShareHomeTitle = firstString(raw.shareHomeTitle);
  if (
    (!firstString(settings.githubShareHomeTitle) || settings.githubShareHomeTitle === defaultSettings.githubShareHomeTitle)
    && legacyShareHomeTitle
  ) {
    settings.githubShareHomeTitle = legacyShareHomeTitle;
    migrated = true;
  }

  return { settings, migrated };
}

module.exports = {
  migrateSettings,
};

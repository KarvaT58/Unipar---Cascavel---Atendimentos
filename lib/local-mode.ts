export function readBooleanEnv(value: string | undefined) {
  return ["1", "true", "yes", "on"].includes(
    value?.trim().toLowerCase() ?? ""
  )
}

export function isProductionRuntime() {
  return process.env.NODE_ENV === "production"
}

export function isLocalDataOnlyRequested() {
  return (
    readBooleanEnv(process.env.LOCAL_DATA_ONLY) ||
    readBooleanEnv(process.env.AUTH_OFFLINE_ONLY)
  )
}

export function allowLocalDataInProduction() {
  return readBooleanEnv(process.env.ALLOW_LOCAL_DATA_IN_PRODUCTION)
}

export function isLocalDataBlockedInProduction() {
  return (
    isProductionRuntime() &&
    isLocalDataOnlyRequested() &&
    !allowLocalDataInProduction()
  )
}

export function isLocalDataOnlyEnabled() {
  if (isLocalDataBlockedInProduction()) {
    return false
  }

  return isLocalDataOnlyRequested()
}

export function canUseOfflineFallback() {
  return !isProductionRuntime() || allowLocalDataInProduction()
}

export function shouldSeedLocalAdminUser() {
  if (isProductionRuntime() && !allowLocalDataInProduction()) {
    return false
  }

  return (
    isLocalDataOnlyEnabled() ||
    readBooleanEnv(process.env.LOCAL_AUTH_USER_SEED)
  )
}

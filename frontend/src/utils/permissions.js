const MANAGER_ROLES = ['GROUP_FLEET_MANAGER', 'FLEET_MANAGER'];
const STAFF_ROLES = [...MANAGER_ROLES, 'FLEET_OFFICER'];

const OFFICER_DELETE_ENTITIES = new Set([
  'driver_logbook',
  'logbook_entry',
  'maintenance_request',
  'pretrip_checklist',
]);

const PROTECTED_ENTITIES = new Set([
  'vehicle',
  'vehicles',
  'driver',
  'drivers',
  'asset',
  'assets',
  'vendor',
  'vendors',
  'tire',
  'tires',
]);

/** Fleet Manager + Group Fleet Manager can hard-delete most entities; Officer is limited. */
export function canHardDelete(role, entityType) {
  if (!role) return false;
  const normalized = String(entityType).toLowerCase().replace(/-/g, '_');

  if (MANAGER_ROLES.includes(role)) return true;

  if (role === 'FLEET_OFFICER') {
    if (PROTECTED_ENTITIES.has(normalized)) return false;
    return OFFICER_DELETE_ENTITIES.has(normalized);
  }

  return false;
}

export function canEditFleetRecord(role) {
  return STAFF_ROLES.includes(role);
}

/** Edit pending maintenance: staff or the submitting driver. */
export function canEditMaintenanceRequest(role, isPersonalView, request) {
  if (!request || request.status !== 'PENDING') return false;
  if (canEditFleetRecord(role) && !isPersonalView) return true;
  return !!isPersonalView;
}

/** Edit logbook: staff (all) or driver/user in personal view. */
export function canEditLogbookEntry(role, isPersonalView) {
  return canEditFleetRecord(role) || isPersonalView;
}

export function canEditPreTripChecklist(role, isPersonalView, checklist, user) {
  if (!checklist) return false;
  if (canEditFleetRecord(role) && !isPersonalView) return true;
  const userDriverId = user?.driver_id || user?.id;
  return isPersonalView && checklist.driver_id === userDriverId;
}

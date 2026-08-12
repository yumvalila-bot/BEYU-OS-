import { SetMetadata } from '@nestjs/common';
export const REQUIRED_PERMISSIONS_KEY = 'requiredPermissions';
export const RequirePermissions = (...permissions: Array<{ resource: string; action: string }>) =>
  SetMetadata(REQUIRED_PERMISSIONS_KEY, permissions);

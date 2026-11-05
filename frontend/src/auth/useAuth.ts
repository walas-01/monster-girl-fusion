import { useEffect, useMemo, useSyncExternalStore } from 'react';
import { AuthController } from './controller';
import { authApi } from './api';
import type { AuthApi } from './api';

export function useAuth(api: AuthApi = authApi) {
  const controller = useMemo(() => new AuthController(api), [api]);
  const state = useSyncExternalStore(controller.subscribe, controller.snapshot);
  useEffect(() => {
    controller.activate();
    return () => controller.deactivate();
  }, [controller]);
  return { ...state, login: controller.login, logout: controller.logout, refresh: controller.refresh,
    setUsername: controller.setUsername };
}

import React from 'react';
import { useContainer } from './useContainer';
import { InjectionToken } from 'tsyringe';

export const useResolve = <T>(token: InjectionToken<T>): T => {
  const container = useContainer();

  return React.useMemo(() => container.resolve(token), [
    token,
    container,
  ]);
};

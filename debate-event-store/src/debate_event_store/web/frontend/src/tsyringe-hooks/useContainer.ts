import { DependencyContainer } from 'tsyringe';
import React from 'react';

import { ContainerContext } from './ContainerContext';

export function useContainer(): DependencyContainer {
  const container = React.useContext(ContainerContext);

  if (container === null) {
    throw new Error(
      "Could not get a container from a context. Did you forget to pass the container through 'ContainerProvider'?",
    );
  }

  return container;
}

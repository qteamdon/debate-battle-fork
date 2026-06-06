import { DependencyContainer } from 'tsyringe';
import React from 'react';
import { ContainerContext } from './ContainerContext';

const ContainerProvider: React.FunctionComponent<{
  children?: React.ReactNode;
  container: DependencyContainer;
}> = ({ children, container }) => {
  return (
    <ContainerContext.Provider value={container}>
      {children}
    </ContainerContext.Provider>
  );
};

export default ContainerProvider;

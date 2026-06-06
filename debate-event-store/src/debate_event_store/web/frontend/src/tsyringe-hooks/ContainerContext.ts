import { DependencyContainer } from 'tsyringe';
import React from 'react';

export const ContainerContext = React.createContext<DependencyContainer | null>(null);

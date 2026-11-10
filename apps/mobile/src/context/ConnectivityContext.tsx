import React, { createContext, useContext, useEffect, useState } from 'react';
import NetInfo, { NetInfoState } from '@react-native-community/netinfo';

interface ConnectivityContextType {
  isOnline: boolean;
  networkType: string;
}

const ConnectivityContext = createContext<ConnectivityContextType>({
  isOnline: true,
  networkType: 'unknown'
});

export const ConnectivityProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [isOnline, setIsOnline] = useState<boolean>(true);
  const [networkType, setNetworkType] = useState<string>('wifi');

  useEffect(() => {
    const unsubscribe = NetInfo.addEventListener((state: NetInfoState) => {
      const online = Boolean(state.isConnected && state.isInternetReachable !== false);
      setIsOnline(online);
      setNetworkType(state.type);
    });

    return () => {
      unsubscribe();
    };
  }, []);

  return (
    <ConnectivityContext.Provider value={{ isOnline, networkType }}>
      {children}
    </ConnectivityContext.Provider>
  );
};

export const useConnectivity = () => useContext(ConnectivityContext);

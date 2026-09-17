import { useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';

import { subscribeToNativeDeepLinks } from '../native/deepLink';

export function useNativeDeepLinks(): void {
  const navigate = useNavigate();
  const navigateRef = useRef(navigate);
  navigateRef.current = navigate;

  useEffect(() => subscribeToNativeDeepLinks((path) => navigateRef.current(path)), []);
}

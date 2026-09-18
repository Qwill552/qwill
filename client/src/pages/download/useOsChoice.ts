import { useCallback, useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';

export type OsChoice = 'android' | 'windows';

const OS_PARAM = 'os';

function isOsChoice(value: string | null): value is OsChoice {
  return value === 'android' || value === 'windows';
}

function detectOs(): OsChoice {
  return /Android/i.test(navigator.userAgent) ? 'android' : 'windows';
}

export interface OsChoiceState {
  os: OsChoice;
  setOs: (os: OsChoice) => void;
}

export function useOsChoice(): OsChoiceState {
  const [searchParams, setSearchParams] = useSearchParams();
  const [os, setOsState] = useState<OsChoice>(() => {
    const paramOs = searchParams.get(OS_PARAM);
    return isOsChoice(paramOs) ? paramOs : detectOs();
  });

  useEffect(() => {
    const paramOs = searchParams.get(OS_PARAM);
    if (isOsChoice(paramOs)) setOsState(paramOs);
  }, [searchParams]);

  const setOs = useCallback(
    (next: OsChoice) => {
      setOsState(next);
      setSearchParams(
        (prev) => {
          const params = new URLSearchParams(prev);
          params.set(OS_PARAM, next);
          return params;
        },
        { replace: true },
      );
    },
    [setSearchParams],
  );

  return { os, setOs };
}

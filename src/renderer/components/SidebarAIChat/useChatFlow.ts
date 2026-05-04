import { useState, useCallback } from 'react';
import type { ChatPhase } from './types';

export function useChatFlow(initial: ChatPhase = 'idle') {
  const [phase, setPhaseRaw] = useState<ChatPhase>(initial);

  const setPhase = useCallback((next: ChatPhase) => {
    setPhaseRaw(next);
  }, []);

  return { phase, setPhase };
}

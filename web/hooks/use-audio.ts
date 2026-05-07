'use client'

import { audioAssetUrl } from '@/lib/assets'
import { useRef, useCallback, useEffect, useMemo, useSyncExternalStore } from 'react'

export interface AudioOptions {
  volume?: number
  loop?: boolean
  onEnd?: () => void
  onError?: (error: Error) => void
}

interface AudioStore {
  audioRefs: Map<string, HTMLAudioElement>
  endedHandlers: Map<string, () => void>
  muted: boolean
  subscribers: Set<() => void>
}

interface UseAudioConfig {
  cleanupOnUnmount?: boolean
}

const AUDIO_STORE_KEY = '__VERITY_AUDIO_STORE__'

const getAudioStore = (): AudioStore => {
  const globalWithStore = globalThis as typeof globalThis & {
    [AUDIO_STORE_KEY]?: AudioStore
  }

  if (!globalWithStore[AUDIO_STORE_KEY]) {
    globalWithStore[AUDIO_STORE_KEY] = {
      audioRefs: new Map(),
      endedHandlers: new Map(),
      muted: true,
      subscribers: new Set()
    }
  }

  return globalWithStore[AUDIO_STORE_KEY] as AudioStore
}

export function useAudio(config: UseAudioConfig = {}) {
  const { cleanupOnUnmount = true } = config
  const audioStore = useMemo(getAudioStore, [])
  const ownedIdsRef = useRef<Set<string>>(new Set())

  const subscribe = useCallback((listener: () => void) => {
    audioStore.subscribers.add(listener)
    return () => {
      audioStore.subscribers.delete(listener)
    }
  }, [audioStore])

  const notifySubscribers = useCallback(() => {
    audioStore.subscribers.forEach((listener) => {
      try {
        listener()
      } catch (error) {
        console.error('Audio subscriber notification failed:', error)
      }
    })
  }, [audioStore])

  const stop = useCallback((id: string) => {
    const audio = audioStore.audioRefs.get(id)
    if (audio) {
      audio.pause()
      audio.currentTime = 0

      const handler = audioStore.endedHandlers.get(id)
      if (handler) {
        audio.removeEventListener('ended', handler)
        audioStore.endedHandlers.delete(id)
      }

      audioStore.audioRefs.delete(id)
    }

    ownedIdsRef.current.delete(id)
  }, [audioStore])

  const play = useCallback((id: string, src: string, options?: AudioOptions) => {
    try {
      stop(id)

      const audio = new Audio(src)
      audio.volume = options?.volume ?? 0.5
      audio.loop = options?.loop ?? false
      audio.muted = audioStore.muted

      if (options?.onEnd) {
        const handler = () => {
          options.onEnd?.()
          stop(id)
        }

        audio.addEventListener('ended', handler)
        audioStore.endedHandlers.set(id, handler)
      }

      audioStore.audioRefs.set(id, audio)
      ownedIdsRef.current.add(id)

      audio.play().catch((error) => {
        console.error(`Audio playback failed for ${id}:`, error)
        options?.onError?.(error as Error)
      })

      return audio
    } catch (error) {
      console.error(`Failed to create audio for ${id}:`, error)
      options?.onError?.(error as Error)
      return null
    }
  }, [audioStore, stop])

  const stopAll = useCallback(() => {
    audioStore.audioRefs.forEach((_, id) => {
      stop(id)
    })
  }, [audioStore, stop])

  const stopAllExcept = useCallback((excludeIds: string[]) => {
    const excludeSet = new Set(excludeIds)
    audioStore.audioRefs.forEach((_, id) => {
      if (!excludeSet.has(id)) {
        stop(id)
      }
    })
  }, [audioStore, stop])

  const setVolume = useCallback((id: string, volume: number) => {
    const audio = audioStore.audioRefs.get(id)
    if (audio) {
      audio.volume = Math.max(0, Math.min(1, volume))
    }
  }, [audioStore])

  const isPlaying = useCallback((id: string): boolean => {
    const audio = audioStore.audioRefs.get(id)
    return audio ? !audio.paused : false
  }, [audioStore])

  const setMuted = useCallback((muted: boolean) => {
    if (audioStore.muted === muted) {
      return
    }

    audioStore.muted = muted
    audioStore.audioRefs.forEach((audio) => {
      audio.muted = muted
    })

    notifySubscribers()
  }, [audioStore, notifySubscribers])

  const toggleMuted = useCallback(() => {
    setMuted(!audioStore.muted)
  }, [audioStore.muted, setMuted])

  const muted = useSyncExternalStore(
    subscribe,
    () => audioStore.muted,
    () => false
  )

  useEffect(() => {
    return () => {
      if (!cleanupOnUnmount) {
        return
      }

      ownedIdsRef.current.forEach((id) => {
        stop(id)
      })
    }
  }, [cleanupOnUnmount, stop])

  return {
    play,
    stop,
    stopAll,
    stopAllExcept,
    setVolume,
    isPlaying,
    isMuted: muted,
    setMuted,
    toggleMuted
  }
}

export const AUDIO_PRESETS = {
  enterGachaPage: {
    src: audioAssetUrl('gacha/enter_gacha_page.mp3'),
    volume: 0.5
  },
  buybackSuccess: {
    src: audioAssetUrl('gacha/gacha_sellback.mp3'),
    volume: 1
  },
  gachaBgmLastSummer: {
    src: audioAssetUrl('gacha/gacha_bgm_last_summer.mp3'),
    volume: 0.1,
    loop: true
  },
  loungeBgm: {
    src: audioAssetUrl('lounge_bgm_over_the_moon.mp3'),
    volume: 0.2,
    loop: true
  },
  preGacha: {
    src: audioAssetUrl('gacha/pre_gacha.wav'),
    volume: 0.5
  },
  gachaLoop: {
    src: audioAssetUrl('gacha/gacha.wav'),
    volume: 0.3,
    loop: true
  },
  machineChange: {
    src: audioAssetUrl('gacha/gacha_change_machine.mp3'),
    volume: 0.6
  },
  postGacha: {
    src: audioAssetUrl('gacha/post_gacha.wav'),
    volume: 0.5
  },
  postGachaMeh: {
    src: audioAssetUrl('gacha/post_gacha_meh.mp3'),
    volume: 0.5
  }
} as const

// Audio IDs for consistency
export const AUDIO_IDS = {
  ENTER_GACHA_PAGE: 'enter-gacha-page',
  BUYBACK_SUCCESS: 'buyback-success',
  GACHA_BGM_LAST_SUMMER: 'gacha-bgm-last-summer',
  GACHA_MACHINE_CHANGE: 'gacha-machine-change',
  LOUNGE_BGM: 'lounge-bgm',
  PRE_GACHA: 'pre-gacha',
  GACHA_LOOP: 'gacha-loop',
  POST_GACHA: 'post-gacha'
} as const

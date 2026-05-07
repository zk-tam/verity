"use client";

import { useState, useEffect, useRef, useMemo, useCallback } from "react";
import { Logomark, LogoTypography } from "@/components/icons";
import { NeuButton } from "@/components/neu-button";
import {
  AtSign,
  CheckCircle2,
  Copy,
  Loader,
  Loader2,
  Mail,
  Wallet,
} from "lucide-react";
import { useAudio, AUDIO_PRESETS, AUDIO_IDS } from "@/hooks/use-audio";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { TextAnimate } from "@/components/ui/text-animate";
import Image from "next/image";
import { usePrivy } from "@privy-io/react-auth";
import { assetUrl, staticAssetUrl } from "@/lib/assets";
const WAITLIST_PROMPT_SESSION_KEY = "verity:prompt-waitlist-after-auth";

type LinkedAccountLike = Record<string, any>;

type WaitlistEntry = {
  id: string;
  email: string | null;
  x_handle: string | null;
  solana_address: string | null;
  created_at: string;
  updated_at: string;
};

type ConnectedProfile = {
  provider: string;
  displayName: string;
  handle: string | null;
  email: string | null;
  image: string | null;
  initials: string;
};

type ConfirmedIdentity = {
  icon: typeof AtSign | typeof Mail | typeof Wallet;
  label: string;
};

const readAccountString = (
  account: LinkedAccountLike | undefined,
  keys: string[],
) => {
  if (!account) return "";

  for (const key of keys) {
    const value = account[key] ?? account.profile?.[key] ?? account.user?.[key];
    if (typeof value === "string" && value.trim()) {
      return value.trim();
    }
  }

  return "";
};

const normalizeXHandle = (value: string) => {
  if (!value) return "";
  return value.startsWith("@") ? value : `@${value}`;
};

const stripXHandlePrefix = (value: string) => value.replace(/^@+/, "");

const normalizeTwitterAvatarUrl = (value: string) => {
  if (!value) return "";

  const querySized = value.replace(
    /([?&]name=)normal(?=(&|$))/i,
    (_, prefix: string) => `${prefix}400x400`,
  );
  if (querySized !== value) return querySized;

  return value.replace(/_normal(?=(?:\.[a-z0-9]+)?(?:[?#]|$))/i, "_400x400");
};

const buildInitials = (value: string) => {
  const cleaned = value.replace(/^@/, "").trim();
  const [first, second] = cleaned.split(/[\s._@-]+/).filter(Boolean);
  if (first && second) return `${first[0]}${second[0]}`.toUpperCase();
  return (cleaned[0] || "V").toUpperCase();
};

const formatEmailIdentity = (value?: string | null) => {
  if (!value) return "";
  const [localPart] = value.split("@");
  return localPart || value;
};

const shortenAddress = (value?: string | null) => {
  if (!value) return "";
  if (value.length <= 12) return value;
  return `${value.slice(0, 4)}...${value.slice(-4)}`;
};

export default function Home() {
  const [videoLoaded, setVideoLoaded] = useState(false);
  const [showPoster, setShowPoster] = useState(true);
  const [isTransitioning, setIsTransitioning] = useState(false);
  const [isWaitlistDialogOpen, setIsWaitlistDialogOpen] = useState(false);
  const [waitlistEmail, setWaitlistEmail] = useState("");
  const [waitlistHandle, setWaitlistHandle] = useState("");
  const [isSubmittingWaitlist, setIsSubmittingWaitlist] = useState(false);
  const [isCheckingWaitlist, setIsCheckingWaitlist] = useState(false);
  const [hasLoadedWaitlistStatus, setHasLoadedWaitlistStatus] = useState(false);
  const [waitlistEntry, setWaitlistEntry] = useState<WaitlistEntry | null>(
    null,
  );
  const [referralCode, setReferralCode] = useState<string | null>(null);
  const [referralCopied, setReferralCopied] = useState(false);
  const [profileImageFailed, setProfileImageFailed] = useState(false);
  const [shouldOpenWaitlistAfterLogin, setShouldOpenWaitlistAfterLogin] =
    useState(false);
  const videoRef = useRef<HTMLVideoElement>(null);
  const { play } = useAudio({ cleanupOnUnmount: false });
  const {
    ready,
    authenticated,
    user: privyUser,
    login,
    getAccessToken,
  } = usePrivy();
  const isValidEmail = (value: string) =>
    /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);

  const WAITLIST_STAGE = process.env.NEXT_PUBLIC_WAITLIST_STAGE === "true";

  const playLandingVideo = useCallback(() => {
    const video = videoRef.current;
    if (!video) return;

    video.muted = true;
    const attempt = video.play();
    if (attempt && typeof attempt.then === "function") {
      attempt.catch((error) => {
        console.debug("Landing video play blocked", error);
      });
    }
  }, []);

  const linkedAccounts = (privyUser?.linkedAccounts ??
    []) as LinkedAccountLike[];
  const twitterAccount = linkedAccounts.find(
    (account) => account.type === "twitter_oauth",
  );
  const googleAccount = linkedAccounts.find(
    (account) => account.type === "google_oauth",
  );
  const emailAccount = linkedAccounts.find(
    (account) => account.type === "email",
  );
  const walletAccount = linkedAccounts.find(
    (account) => account.type === "wallet",
  );

  const getPrivyEmail = () => {
    return (
      privyUser?.email?.address ||
      readAccountString(emailAccount, ["address", "email"]) ||
      readAccountString(googleAccount, ["email", "address"]) ||
      readAccountString(twitterAccount, ["email", "address"]) ||
      ""
    );
  };

  const getPrivyXHandle = () => {
    return normalizeXHandle(
      readAccountString(twitterAccount, ["username", "screen_name"]),
    );
  };

  const connectedProfile = useMemo<ConnectedProfile | null>(() => {
    const twitterHandle = normalizeXHandle(
      readAccountString(twitterAccount, ["username", "screen_name"]),
    );
    const twitterName =
      readAccountString(twitterAccount, [
        "name",
        "display_name",
        "displayName",
      ]) || twitterHandle;
    const twitterImage = normalizeTwitterAvatarUrl(
      readAccountString(twitterAccount, [
        "profile_picture_url",
        "profilePictureUrl",
        "profile_image_url",
        "profileImageUrl",
        "avatar_url",
        "avatarUrl",
        "image_url",
        "imageUrl",
        "image",
        "picture",
      ]),
    );

    if (twitterAccount) {
      const displayName = twitterName || "X profile";
      return {
        provider: "X",
        displayName,
        handle: twitterHandle || null,
        email: getPrivyEmail() || null,
        image: twitterImage || null,
        initials: buildInitials(twitterHandle || displayName),
      };
    }

    if (googleAccount) {
      const email = getPrivyEmail();
      const displayName =
        readAccountString(googleAccount, [
          "name",
          "display_name",
          "displayName",
        ]) ||
        email ||
        "Google profile";
      return {
        provider: "Google",
        displayName,
        handle: null,
        email: email || null,
        image:
          readAccountString(googleAccount, [
            "picture",
            "image",
            "profile_picture_url",
            "profilePictureUrl",
          ]) || null,
        initials: buildInitials(displayName),
      };
    }

    if (emailAccount || privyUser?.email?.address) {
      const email = getPrivyEmail();
      return {
        provider: "Email",
        displayName: formatEmailIdentity(email) || "Email profile",
        handle: null,
        email: email || null,
        image: null,
        initials: buildInitials(email || "V"),
      };
    }

    if (walletAccount || privyUser?.wallet?.address) {
      const address =
        readAccountString(walletAccount, [
          "address",
          "public_key",
          "publicKey",
        ]) ||
        privyUser?.wallet?.address ||
        "";
      return {
        provider: "Wallet",
        displayName: shortenAddress(address) || "Solana wallet",
        handle: null,
        email: null,
        image: null,
        initials: "W",
      };
    }

    return null;
  }, [emailAccount, googleAccount, privyUser, twitterAccount, walletAccount]);

  const hasPrivyWallet = () =>
    Boolean(
      privyUser?.wallet?.address ||
      privyUser?.linkedAccounts?.some(
        (account: any) => account.type === "wallet",
      ),
    );

  const formatJoinedDate = (value?: string | null) => {
    if (!value) return null;
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return null;
    return new Intl.DateTimeFormat(undefined, {
      month: "short",
      day: "numeric",
      year: "numeric",
    }).format(date);
  };

  const openWaitlistDialog = () => {
    setWaitlistEmail((current) => current || getPrivyEmail());
    setWaitlistHandle((current) => current || getPrivyXHandle());
    setIsWaitlistDialogOpen(true);
  };

  const markWaitlistPromptPending = () => {
    window.sessionStorage.setItem(WAITLIST_PROMPT_SESSION_KEY, "true");
  };

  const clearWaitlistPromptPending = () => {
    window.sessionStorage.removeItem(WAITLIST_PROMPT_SESSION_KEY);
  };

  const hasPendingWaitlistPrompt = () =>
    window.sessionStorage.getItem(WAITLIST_PROMPT_SESSION_KEY) === "true";

  useEffect(() => {
    if (shouldOpenWaitlistAfterLogin && ready && authenticated) {
      markWaitlistPromptPending();
    }
  }, [authenticated, ready, shouldOpenWaitlistAfterLogin, privyUser]);

  useEffect(() => {
    if (
      !WAITLIST_STAGE ||
      !ready ||
      !authenticated ||
      !hasLoadedWaitlistStatus ||
      waitlistEntry ||
      isWaitlistDialogOpen ||
      !hasPendingWaitlistPrompt()
    ) {
      return;
    }

    setShouldOpenWaitlistAfterLogin(false);
    openWaitlistDialog();
  }, [
    WAITLIST_STAGE,
    authenticated,
    hasLoadedWaitlistStatus,
    isWaitlistDialogOpen,
    privyUser,
    ready,
    waitlistEntry,
  ]);

  useEffect(() => {
    setProfileImageFailed(false);
  }, [connectedProfile?.image]);

  useEffect(() => {
    if (!WAITLIST_STAGE || !ready) return;

    if (!authenticated) {
      setWaitlistEntry(null);
      setHasLoadedWaitlistStatus(false);
      return;
    }

    let isActive = true;

    const fetchWaitlistStatus = async () => {
      setIsCheckingWaitlist(true);

      try {
        const token = await getAccessToken();
        if (!token) return;

        const response = await fetch("/api/waitlist", {
          headers: {
            Authorization: `Bearer ${token}`,
          },
          cache: "no-store",
        });

        const data = await response.json().catch(() => null);
        if (!isActive) return;

        if (response.ok) {
          const entry = data?.data ?? null;
          setWaitlistEntry(entry);
          if (entry) {
            clearWaitlistPromptPending();
          }
        }
      } catch (error) {
        console.error("Failed to load waitlist status:", error);
      } finally {
        if (isActive) {
          setIsCheckingWaitlist(false);
          setHasLoadedWaitlistStatus(true);
        }
      }
    };

    fetchWaitlistStatus();

    return () => {
      isActive = false;
    };
  }, [WAITLIST_STAGE, authenticated, getAccessToken, ready]);

  useEffect(() => {
    if (!ready || !authenticated || !waitlistEntry) {
      setReferralCode(null);
      return;
    }

    let isActive = true;

    (async () => {
      try {
        const token = await getAccessToken();
        if (!token) return;
        const response = await fetch("/api/referrals/code", {
          headers: { Authorization: `Bearer ${token}` },
          cache: "no-store",
        });
        const data = await response.json().catch(() => null);
        if (!isActive) return;
        if (response.ok && data?.data?.code) {
          setReferralCode(data.data.code);
        }
      } catch (error) {
        console.warn("Failed to load referral code:", error);
      }
    })();

    return () => {
      isActive = false;
    };
  }, [ready, authenticated, waitlistEntry, getAccessToken]);

  const referralShareUrl = useMemo(() => {
    if (!referralCode) return null;
    if (typeof window === "undefined") return null;
    return `${window.location.origin}?ref=${referralCode}`;
  }, [referralCode]);

  const handleCopyReferral = async () => {
    if (!referralShareUrl) return;
    try {
      await navigator.clipboard.writeText(referralShareUrl);
      setReferralCopied(true);
      toast.success("Referral link copied!");
      setTimeout(() => setReferralCopied(false), 2000);
    } catch {
      toast.error("Failed to copy link.");
    }
  };

  useEffect(() => {
    const video = videoRef.current;
    if (video?.readyState && !video.paused) {
      setVideoLoaded(true);
    }

    const fallbackTimer = setTimeout(() => {
      setVideoLoaded(true);
      playLandingVideo();
    }, 2000);

    return () => clearTimeout(fallbackTimer);
  }, [playLandingVideo]);

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    playLandingVideo();

    const handleVisibility = () => {
      if (document.visibilityState === "visible") {
        playLandingVideo();
      }
    };

    const handleFirstInteraction = () => {
      playLandingVideo();
      window.removeEventListener("click", handleFirstInteraction);
      window.removeEventListener("keydown", handleFirstInteraction);
    };

    document.addEventListener("visibilitychange", handleVisibility);
    window.addEventListener("click", handleFirstInteraction);
    window.addEventListener("keydown", handleFirstInteraction);

    return () => {
      document.removeEventListener("visibilitychange", handleVisibility);
      window.removeEventListener("click", handleFirstInteraction);
      window.removeEventListener("keydown", handleFirstInteraction);
    };
  }, [playLandingVideo]);

  const handleTransition = () => {
    setIsTransitioning(true);
    setTimeout(() => {
      window.location.href = "/gacha?id=1";
    }, 1000);
  };

  const handleVideoEnd = () => {
    handleTransition();
  };

  const handleJoinWaitlist = () => {
    const preset = AUDIO_PRESETS.enterGachaPage;
    play(AUDIO_IDS.ENTER_GACHA_PAGE, preset.src, {
      volume: preset.volume,
    });

    if (!ready) {
      toast.error("Privy is still loading. Please try again.");
      return;
    }

    if (!authenticated) {
      markWaitlistPromptPending();
      setShouldOpenWaitlistAfterLogin(true);
      login({
        loginMethods: ["email", "google", "twitter", "wallet"],
        walletChainType: "solana-only",
      });
      return;
    }

    openWaitlistDialog();
  };

  const handleCatchEmAll = () => {
    const preset = AUDIO_PRESETS.enterGachaPage;
    play(AUDIO_IDS.ENTER_GACHA_PAGE, preset.src, {
      volume: preset.volume,
    });
    window.location.href = "/explore";
  };

  const handleWaitlistSubmit = async (
    event: React.FormEvent<HTMLFormElement>,
  ) => {
    event.preventDefault();
    setIsSubmittingWaitlist(true);

    try {
      const trimmedEmail = waitlistEmail.trim();
      const trimmedHandle = waitlistHandle.trim();
      const normalizedHandle =
        trimmedHandle.length > 0 && !trimmedHandle.startsWith("@")
          ? `@${trimmedHandle}`
          : trimmedHandle;

      if (trimmedEmail && !isValidEmail(trimmedEmail)) {
        toast.error("Please enter a valid email address.");
        return;
      }

      if (!trimmedEmail && !normalizedHandle && !hasPrivyWallet()) {
        toast.error("Please add an email or X handle to join.");
        return;
      }

      const token = await getAccessToken();
      if (!token) {
        toast.error("Please log in with Privy first.");
        return;
      }

      const response = await fetch("/api/waitlist", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          email_address: trimmedEmail || null,
          x_handle: normalizedHandle || null,
        }),
      });

      const data = await response.json().catch(() => null);

      if (!response.ok) {
        let errorMessage =
          "Failed to join the waitlist, please try again later.";
        if (data && data.error === "WAITLIST_ENTRY_EXISTS") {
          errorMessage =
            "You're already on the waitlist, stay tuned for Verity updates!";
        }
        toast.error(errorMessage);
        return;
      }

      toast.success("You're in! You'll be notified on Verity updates!");
      clearWaitlistPromptPending();
      setWaitlistEntry(data?.data ?? null);
      setIsWaitlistDialogOpen(false);
      setWaitlistEmail("");
      setWaitlistHandle("");
    } catch (error) {
      console.error("Failed to submit waitlist entry:", error);
      toast.error("Unable to join the waitlist. Please try again later.");
    } finally {
      setIsSubmittingWaitlist(false);
    }
  };

  const handleWaitlistDialogClose = (open: boolean) => {
    setIsWaitlistDialogOpen(open);
    if (!open) {
      clearWaitlistPromptPending();
      setShouldOpenWaitlistAfterLogin(false);
      setWaitlistEmail("");
      setWaitlistHandle("");
    }
  };

  const heroText = useMemo(
    () => (
      <div
        className="text-white text-center font-bold mb-2"
        style={{
          textShadow: "0 0 5px rgba(255, 255, 255, 0.3)",
        }}
      >
        <TextAnimate
          animation="slideUp"
          by="word"
          delay={1}
          startOnView={false}
          once
        >
          Building the TCG Space
        </TextAnimate>

        <TextAnimate
          animation="slideUp"
          by="word"
          delay={1.7}
          startOnView={false}
          once
        >
          Coming Soon
        </TextAnimate>
      </div>
    ),
    [],
  );

  const joinedDate = formatJoinedDate(waitlistEntry?.created_at);
  const confirmedProfileImage = connectedProfile?.image;
  const confirmedProfileName =
    connectedProfile?.displayName ||
    waitlistEntry?.x_handle ||
    waitlistEntry?.email ||
    "Verity member";
  const confirmedProfileInitials =
    connectedProfile?.initials || buildInitials(confirmedProfileName);
  const rawConfirmedHandle =
    connectedProfile?.handle || waitlistEntry?.x_handle;
  const confirmedHandle = rawConfirmedHandle
    ? stripXHandlePrefix(rawConfirmedHandle)
    : null;
  const confirmedEmail =
    waitlistEntry?.email || connectedProfile?.email || null;
  const confirmedIdentity: ConfirmedIdentity | null = confirmedHandle
    ? {
        icon: AtSign,
        label: confirmedHandle,
      }
    : confirmedEmail
      ? {
          icon: Mail,
          label: confirmedEmail,
        }
      : waitlistEntry?.solana_address
        ? {
            icon: Wallet,
            label: shortenAddress(waitlistEntry.solana_address),
          }
        : null;
  const ConfirmedIdentityIcon = confirmedIdentity?.icon;
  const shouldShowWaitlistFields =
    !twitterAccount && !emailAccount && !googleAccount;
  const waitlistMetaItems = [
    waitlistEntry?.email && confirmedHandle
      ? {
          icon: Mail,
          label: waitlistEntry.email,
        }
      : null,
    waitlistEntry?.solana_address
      ? {
          icon: Wallet,
          label: shortenAddress(waitlistEntry.solana_address),
        }
      : null,
  ].filter(Boolean) as Array<{
    icon: typeof AtSign;
    label: string;
  }>;

  return (
    <div className="fixed inset-0 w-screen h-screen z-50 bg-black">
      {showPoster && (
        <div
          className="absolute inset-0 w-full h-full bg-cover bg-center bg-no-repeat transition-opacity duration-500"
          style={{
            backgroundImage: `url(${assetUrl("landing_page_bg.png")})`,
            opacity: showPoster ? 1 : 0,
          }}
        />
      )}

      <video
        ref={videoRef}
        className="absolute inset-0 w-full h-full object-cover"
        autoPlay
        muted
        playsInline
        loop
        preload="auto"
        poster={assetUrl("landing_page_bg.png")}
        onEnded={handleVideoEnd}
        onCanPlay={() => playLandingVideo()}
        onCanPlayThrough={() => playLandingVideo()}
        onLoadedData={() => playLandingVideo()}
        onPlaying={() => {
          setVideoLoaded(true);
          setShowPoster(false);
        }}
        onPause={() => {
          const video = videoRef.current;
          if (video && !video.ended && document.visibilityState === "visible") {
            window.requestAnimationFrame(() => playLandingVideo());
          }
        }}
        onError={() => {
          setVideoLoaded(true);
          setShowPoster(true);
        }}
        onWaiting={() => console.log("Video buffering...")}
      >
        <source src={staticAssetUrl("landing_page_bg.webm")} type="video/webm" />
        <source src={staticAssetUrl("landing_page_bg.mp4")} type="video/mp4" />
      </video>

      {!videoLoaded && (
        <div className="absolute inset-0 flex items-center justify-center">
          <Loader className="w-8 h-8 animate-spin text-white" />
        </div>
      )}

      <div className="absolute inset-0 bg-gradient-to-b from-transparent to-black/20" />

      <div
        className={`absolute inset-0 flex flex-col gap-2 items-center justify-center transition-opacity ${
          videoLoaded ? "opacity-100" : "opacity-0"
        }`}
        style={{
          transitionDuration: "1500ms",
        }}
      >
        <div className="flex flex-wrap items-center">
          <Logomark className="w-12 h-12 md:w-16 md:h-16 text-white drop-shadow-[0_0_1px_#ffffff81]" />
          <LogoTypography className="h-8 md:h-10 w-auto text-white drop-shadow-[0_0_1px_#ffffff81]" />
        </div>

        {WAITLIST_STAGE && heroText}

        {WAITLIST_STAGE ? (
          waitlistEntry ? (
            <div className="w-[min(92vw,520px)] rounded-lg border border-white/20 bg-black/35 px-3.5 py-3 text-white shadow-[0_12px_40px_rgba(0,0,0,0.28)] backdrop-blur-md sm:px-4">
              <div className="grid grid-cols-[48px_minmax(0,1fr)] items-center gap-x-3 gap-y-2 sm:grid-cols-[56px_minmax(0,1fr)_auto] sm:gap-x-4">
                <div className="flex h-12 w-12 shrink-0 items-center justify-center overflow-hidden rounded-full bg-white text-black sm:h-14 sm:w-14">
                  {confirmedProfileImage && !profileImageFailed ? (
                    <Image
                      src={confirmedProfileImage}
                      alt={confirmedProfileName}
                      width={56}
                      height={56}
                      className="h-full w-full object-cover"
                      onError={() => setProfileImageFailed(true)}
                    />
                  ) : (
                    <span className="text-lg font-bold">
                      {confirmedProfileInitials}
                    </span>
                  )}
                </div>
                <div className="min-w-0">
                  <div className="flex items-center gap-1.5">
                    <CheckCircle2 className="h-4 w-4 shrink-0 text-white" />
                    <p className="truncate font-loos-extended-bold text-[13px] uppercase leading-none tracking-normal sm:text-sm">
                      You&apos;re In!
                    </p>
                  </div>
                  {confirmedIdentity && (
                    <div className="mt-1 flex min-w-0 items-center gap-1.5 text-xs leading-none text-white/75">
                      {ConfirmedIdentityIcon && (
                        <ConfirmedIdentityIcon className="h-3.5 w-3.5 shrink-0" />
                      )}
                      <span className="truncate">
                        {confirmedIdentity.label}
                      </span>
                    </div>
                  )}
                </div>
                <div className="col-span-2 row-start-2 flex min-w-0 justify-end sm:col-span-1 sm:col-start-3 sm:row-start-1">
                  <div className="flex max-w-full items-center rounded-full border border-white/15 bg-white/10 px-2.5 py-1 text-xs leading-none text-white/80">
                    {joinedDate ? `Joined ${joinedDate}` : "You're on the list"}
                  </div>
                </div>
                {waitlistMetaItems.length > 0 && (
                  <div className="col-span-2 flex min-w-0 max-w-full flex-wrap justify-end gap-1.5 sm:col-span-1 sm:col-start-3 sm:row-start-2">
                    {waitlistMetaItems.map(({ icon: Icon, label }) => (
                      <div
                        key={label}
                        className="flex max-w-full items-center gap-1.5 rounded-full border border-white/15 bg-white/10 px-2.5 py-1 text-xs leading-none text-white/80"
                      >
                        <Icon className="h-3.5 w-3.5 shrink-0" />
                        <span className="truncate">{label}</span>
                      </div>
                    ))}
                  </div>
                )}
                {referralShareUrl && (
                  <div className="col-span-2 mt-1 flex min-w-0 items-center gap-2 rounded-md border border-white/15 bg-white/5 px-2.5 py-2">
                    <p className="truncate flex-1 text-xs text-white/80">
                      {referralShareUrl}
                    </p>
                    <button
                      type="button"
                      onClick={handleCopyReferral}
                      className="flex shrink-0 items-center gap-1 rounded-full border border-white/20 bg-white/10 px-2.5 py-1 text-[11px] font-medium text-white transition hover:bg-white/20"
                    >
                      {referralCopied ? (
                        <CheckCircle2 className="h-3 w-3" />
                      ) : (
                        <Copy className="h-3 w-3" />
                      )}
                      {referralCopied ? "Copied" : "Copy"}
                    </button>
                  </div>
                )}
              </div>
            </div>
          ) : (
            <NeuButton
              onClick={handleJoinWaitlist}
              variant="lg"
              className="font-loos-extended-bold"
              disabled={isCheckingWaitlist}
            >
              {isCheckingWaitlist ? (
                <span className="flex items-center gap-2">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Checking
                </span>
              ) : (
                "Join Waitlist"
              )}
            </NeuButton>
          )
        ) : (
          <NeuButton
            onClick={handleCatchEmAll}
            variant="lg"
            className="font-loos-extended-bold"
          >
            Get Started
          </NeuButton>
        )}
      </div>

      <div
        className={`absolute inset-0 bg-white pointer-events-none transition-opacity duration-1000 ease-in-out ${
          isTransitioning ? "opacity-100" : "opacity-0"
        }`}
      />

      <Dialog
        open={isWaitlistDialogOpen}
        onOpenChange={handleWaitlistDialogClose}
      >
        <DialogContent
          overlayClassName="bg-black/10"
          className="md:max-w-[350px] bg-black/10 backdrop-blur-md border-white/20 sm:rounded-lg max-h-[80vh] overflow-y-auto"
          closeClassName="opacity-100 ring-offset-transparent focus:ring-0 [&>svg]:w-6 [&>svg]:h-6 text-white hover:text-white/80 top-4 right-4 md:top-6 md:right-6"
        >
          <DialogHeader>
            {authenticated && connectedProfile ? (
              <div className="mb-4 flex flex-col items-center text-center">
                <div className="mb-3 flex h-20 w-20 items-center justify-center overflow-hidden rounded-full border border-white/50 bg-white/15 text-3xl font-bold text-white shadow-[0_10px_30px_rgba(0,0,0,0.25)]">
                  {connectedProfile.image && !profileImageFailed ? (
                    <Image
                      src={connectedProfile.image}
                      alt={connectedProfile.displayName}
                      width={80}
                      height={80}
                      className="h-full w-full object-cover"
                      onError={() => setProfileImageFailed(true)}
                    />
                  ) : (
                    connectedProfile.initials
                  )}
                </div>
                <p className="max-w-full truncate text-base font-bold text-white">
                  {connectedProfile.displayName}
                </p>
                <p className="max-w-full truncate text-xs text-white/70">
                  {connectedProfile.handle ||
                    connectedProfile.email ||
                    `Connected with ${connectedProfile.provider}`}
                </p>
              </div>
            ) : (
              <div className="flex justify-center mb-4 border-[1px] border-white/80 rounded-md">
                <Image
                  src={staticAssetUrl("gacha_25_thumbnail.webp")}
                  alt="Verity Gacha"
                  width={0}
                  height={0}
                  className="w-full aspect-square rounded-md object-cover"
                />
              </div>
            )}
            <DialogTitle className="text-white text-center text-2xl font-loos-extended-bold">
              Join the Waitlist
            </DialogTitle>
            <DialogDescription className="text-white/70 text-xs text-center">
              {authenticated
                ? "Privy connected. Save your launch spot."
                : "Stay Ahead of Verity Launch!"}
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={handleWaitlistSubmit} className="space-y-3">
            {shouldShowWaitlistFields && (
              <div>
                <label
                  htmlFor="waitlist-handle"
                  className="text-xs font-medium text-white"
                >
                  X Handle
                </label>
                <Input
                  id="waitlist-handle"
                  value={waitlistHandle}
                  onChange={(event) => setWaitlistHandle(event.target.value)}
                  placeholder="@Verity_Tcg"
                  className="bg-white/5 border-white/20 text-white placeholder:text-white/40 focus-visible:ring-white/30"
                />
              </div>
            )}
            {shouldShowWaitlistFields && (
              <div>
                <label
                  htmlFor="waitlist-email"
                  className="text-xs font-medium text-white"
                >
                  Email Address (optional)
                </label>
                <Input
                  id="waitlist-email"
                  type="email"
                  value={waitlistEmail}
                  onChange={(event) => setWaitlistEmail(event.target.value)}
                  placeholder="Optional launch email"
                  className="bg-white/5 border-white/20 text-white placeholder:text-white/40 focus-visible:ring-white/30"
                />
              </div>
            )}
            <div className="flex justify-center pt-5">
              <Button
                className="w-full rounded-full bg-white/80 hover:bg-white text-black"
                type="submit"
                disabled={isSubmittingWaitlist}
              >
                {isSubmittingWaitlist ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  "Join Now"
                )}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}

"use client";

import {
  useEffect,
  useState,
} from "react";

import {
  Check,
  ChevronDown,
  Copy,
  ExternalLink,
  Loader2,
  LogOut,
  RefreshCw,
  Wallet,
  X,
} from "lucide-react";

import {
  toast,
} from "sonner";

import {
  explorerAddress,
  type WalletOption,
} from "@/lib/genlayer/client";

import {
  shortAddress,
} from "@/lib/format";

import {
  useWallet,
} from "@/lib/genlayer/wallet-context";

function WalletMark({
  wallet,
  size = 36,
}: {
  wallet:
    WalletOption;
  size?: number;
}) {
  if (
    wallet.icon &&
    wallet.icon.startsWith(
      "data:image/",
    )
  ) {
    return (
      <img
        src={wallet.icon}
        alt=""
        width={size}
        height={size}
        className="rounded-xl"
      />
    );
  }

  return (
    <span
      className="
        grid place-items-center
        rounded-xl border
        border-white/10
        bg-white/[.05]
      "
      style={{
        width: size,
        height: size,
      }}
    >
      <Wallet
        size={Math.max(
          15,
          Math.round(
            size * 0.45,
          ),
        )}
      />
    </span>
  );
}

export function WalletButton() {
  const {
    account,
    wallet,
    wallets,
    chainId,

    selectorOpen,

    connectingWalletId,

    error,

    refreshWallets,
    openWalletSelector,
    closeWalletSelector,

    connect,
    disconnect,
  } = useWallet();

  const [
    menuOpen,
    setMenuOpen,
  ] =
    useState(false);

  useEffect(() => {
    if (!selectorOpen) {
      return;
    }

    const previous =
      document.body.style
        .overflow;

    document.body.style
      .overflow =
      "hidden";

    return () => {
      document.body.style
        .overflow =
        previous;
    };
  }, [selectorOpen]);

  useEffect(() => {
    if (
      !selectorOpen &&
      !menuOpen
    ) {
      return;
    }

    const onKeyDown =
      (
        event:
          KeyboardEvent,
      ) => {
        if (
          event.key !==
          "Escape"
        ) {
          return;
        }

        if (
          selectorOpen
        ) {
          closeWalletSelector();
        }

        setMenuOpen(
          false,
        );
      };

    window.addEventListener(
      "keydown",
      onKeyDown,
    );

    return () =>
      window.removeEventListener(
        "keydown",
        onKeyDown,
      );
  }, [
    selectorOpen,
    menuOpen,
    closeWalletSelector,
  ]);

  const chooseWallet =
    async (
      walletId: string,
    ) => {
      const success =
        await connect(
          walletId,
        );

      if (success) {
        toast.success(
          "Wallet connected",
        );
      }
    };

  const copyAddress =
    async () => {
      if (!account) {
        return;
      }

      try {
        await navigator
          .clipboard
          .writeText(
            account,
          );

        toast.success(
          "Address copied",
        );
      } catch {
        toast.error(
          "Could not copy address",
        );
      }
    };

  const disconnectApp =
    () => {
      disconnect();

      setMenuOpen(
        false,
      );

      toast.success(
        "Wallet disconnected from VerdictGraph",
      );
    };

  const openSelector =
    async () => {
      setMenuOpen(
        false,
      );

      await openWalletSelector();
    };

  const picker =
    selectorOpen ? (
      <WalletPicker
        wallets={wallets}
        error={error}
        connectingWalletId={
          connectingWalletId
        }
        onClose={
          closeWalletSelector
        }
        onRefresh={
          refreshWallets
        }
        onChoose={
          chooseWallet
        }
      />
    ) : null;

  if (
    account &&
    wallet
  ) {
    return (
      <>
        <div className="relative">
          {menuOpen ? (
            <button
              type="button"
              aria-label="Close wallet menu"
              className="
                fixed inset-0
                z-40
                cursor-default
                bg-transparent
              "
              onClick={() =>
                setMenuOpen(
                  false,
                )
              }
            />
          ) : null}

          <button
            type="button"
            aria-haspopup="menu"
            aria-expanded={
              menuOpen
            }
            onClick={() =>
              setMenuOpen(
                (value) =>
                  !value,
              )
            }
            className="
              relative z-50
              inline-flex
              items-center
              gap-2.5
              rounded-full
              border
              border-white/12
              bg-white/[.055]
              py-1.5 pl-1.5
              pr-3
              text-sm
              font-medium
              text-zinc-100
              transition
              hover:border-white/20
              hover:bg-white/[.08]
            "
          >
            <WalletMark
              wallet={wallet}
              size={30}
            />

            <span>
              {shortAddress(
                account,
              )}
            </span>

            <ChevronDown
              size={14}
              className={
                menuOpen
                  ? "rotate-180 transition"
                  : "transition"
              }
            />
          </button>

          {menuOpen ? (
            <div
              role="menu"
              className="
                absolute right-0
                top-12 z-50
                w-[330px]
                overflow-hidden
                rounded-2xl
                border
                border-white/10
                bg-[#0d1016]
                shadow-2xl
                shadow-black/60
              "
            >
              <div
                className="
                  border-b
                  border-white/[.07]
                  p-4
                "
              >
                <div className="flex items-center gap-3">
                  <WalletMark
                    wallet={
                      wallet
                    }
                    size={42}
                  />

                  <div className="min-w-0">
                    <div className="font-medium">
                      {
                        wallet.name
                      }
                    </div>

                    <div className="mt-0.5 text-xs text-zinc-500">
                      Connected to VerdictGraph
                    </div>
                  </div>

                  <span
                    className="
                      ml-auto
                      inline-flex
                      items-center
                      gap-1.5
                      rounded-full
                      border
                      border-emerald-400/15
                      bg-emerald-400/[.07]
                      px-2.5 py-1
                      text-[10px]
                      text-emerald-300
                    "
                  >
                    <Check
                      size={11}
                    />

                    {chainId ===
                    4221
                      ? "Bradbury"
                      : "Check network"}
                  </span>
                </div>

                <div
                  className="
                    mt-4
                    break-all
                    rounded-xl
                    border
                    border-white/[.07]
                    bg-black/20
                    p-3
                    font-mono
                    text-[11px]
                    leading-5
                    text-zinc-400
                  "
                >
                  {account}
                </div>
              </div>

              <div className="p-2">
                <button
                  type="button"
                  role="menuitem"
                  onClick={() =>
                    void copyAddress()
                  }
                  className="
                    flex w-full
                    items-center
                    gap-3
                    rounded-xl
                    px-3 py-2.5
                    text-sm
                    text-zinc-300
                    transition
                    hover:bg-white/[.06]
                    hover:text-white
                  "
                >
                  <Copy
                    size={16}
                  />
                  Copy address
                </button>

                <a
                  role="menuitem"
                  href={explorerAddress(
                    account,
                  )}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="
                    flex w-full
                    items-center
                    gap-3
                    rounded-xl
                    px-3 py-2.5
                    text-sm
                    text-zinc-300
                    transition
                    hover:bg-white/[.06]
                    hover:text-white
                  "
                >
                  <ExternalLink
                    size={16}
                  />
                  View on Bradbury Explorer
                </a>

                <button
                  type="button"
                  role="menuitem"
                  onClick={() =>
                    void openSelector()
                  }
                  className="
                    flex w-full
                    items-center
                    gap-3
                    rounded-xl
                    px-3 py-2.5
                    text-sm
                    text-zinc-300
                    transition
                    hover:bg-white/[.06]
                    hover:text-white
                  "
                >
                  <RefreshCw
                    size={16}
                  />
                  Switch wallet
                </button>

                <div className="my-1 h-px bg-white/[.07]" />

                <button
                  type="button"
                  role="menuitem"
                  onClick={
                    disconnectApp
                  }
                  className="
                    flex w-full
                    items-center
                    gap-3
                    rounded-xl
                    px-3 py-2.5
                    text-sm
                    text-rose-300
                    transition
                    hover:bg-rose-400/[.08]
                  "
                >
                  <LogOut
                    size={16}
                  />
                  Disconnect
                </button>
              </div>
            </div>
          ) : null}
        </div>

        {picker}
      </>
    );
  }

  return (
    <>
      <button
        type="button"
        onClick={() =>
          void openSelector()
        }
        className="
          inline-flex
          items-center
          gap-2
          rounded-full
          border
          border-white/12
          bg-white/[.055]
          px-4 py-2
          text-sm
          font-medium
          text-zinc-100
          transition
          hover:border-white/20
          hover:bg-white/[.08]
        "
      >
        <Wallet size={15} />
        Connect wallet
      </button>

      {picker}
    </>
  );
}

function WalletPicker({
  wallets,
  error,
  connectingWalletId,
  onClose,
  onRefresh,
  onChoose,
}: {
  wallets:
    WalletOption[];

  error:
    string | null;

  connectingWalletId:
    string | null;

  onClose:
    () => void;

  onRefresh:
    () => Promise<void>;

  onChoose:
    (
      walletId: string,
    ) => Promise<void>;
}) {
  return (
    <div
      className="
        fixed inset-0
        z-[100]
        flex items-center
        justify-center
        bg-black/70
        px-5
        backdrop-blur-md
      "
      role="dialog"
      aria-modal="true"
      aria-label="Connect wallet"
      onMouseDown={
        onClose
      }
    >
      <div
        className="
          w-full
          max-w-[440px]
          overflow-hidden
          rounded-[26px]
          border
          border-white/10
          bg-[#0c0f15]
          shadow-2xl
          shadow-black/70
        "
        onMouseDown={(
          event,
        ) =>
          event.stopPropagation()
        }
      >
        <div
          className="
            flex
            items-start
            justify-between
            border-b
            border-white/[.07]
            p-5
          "
        >
          <div>
            <h2 className="text-lg font-semibold tracking-tight">
              Connect a wallet
            </h2>

            <p className="mt-1.5 max-w-sm text-sm leading-6 text-zinc-500">
              Choose which wallet VerdictGraph should use. Nothing connects until you select one.
            </p>
          </div>

          <button
            type="button"
            aria-label="Close"
            onClick={
              onClose
            }
            disabled={
              Boolean(
                connectingWalletId,
              )
            }
            className="
              grid h-8 w-8
              place-items-center
              rounded-full
              border
              border-white/10
              text-zinc-500
              transition
              hover:bg-white/[.06]
              hover:text-white
              disabled:opacity-40
            "
          >
            <X size={15} />
          </button>
        </div>

        <div className="p-3">
          {wallets.length ? (
            <div className="space-y-1.5">
              {wallets.map(
                (
                  candidate,
                ) => {
                  const loading =
                    connectingWalletId ===
                    candidate.id;

                  return (
                    <button
                      key={
                        candidate.id
                      }
                      type="button"
                      disabled={
                        Boolean(
                          connectingWalletId,
                        )
                      }
                      onClick={() =>
                        void onChoose(
                          candidate.id,
                        )
                      }
                      className="
                        flex w-full
                        items-center
                        gap-3.5
                        rounded-2xl
                        border
                        border-transparent
                        px-3 py-3
                        text-left
                        transition
                        hover:border-white/[.08]
                        hover:bg-white/[.045]
                        disabled:cursor-wait
                        disabled:opacity-60
                      "
                    >
                      <WalletMark
                        wallet={
                          candidate
                        }
                        size={44}
                      />

                      <div className="min-w-0 flex-1">
                        <div className="font-medium text-zinc-100">
                          {
                            candidate.name
                          }
                        </div>

                        <div className="mt-1 text-xs text-zinc-500">
                          {candidate.isMetaMask
                            ? "MetaMask · GenLayer Snap"
                            : "Browser wallet · EIP-1193"}
                        </div>
                      </div>

                      {loading ? (
                        <Loader2
                          size={18}
                          className="animate-spin text-zinc-300"
                        />
                      ) : (
                        <ChevronDown
                          size={16}
                          className="-rotate-90 text-zinc-600"
                        />
                      )}
                    </button>
                  );
                },
              )}
            </div>
          ) : (
            <div
              className="
                rounded-2xl
                border
                border-white/[.07]
                bg-white/[.025]
                p-5
                text-center
              "
            >
              <div
                className="
                  mx-auto grid
                  h-11 w-11
                  place-items-center
                  rounded-2xl
                  border
                  border-white/10
                  bg-white/[.04]
                "
              >
                <Wallet
                  size={19}
                />
              </div>

              <div className="mt-3 font-medium">
                No browser wallets detected
              </div>

              <p className="mx-auto mt-1.5 max-w-xs text-sm leading-6 text-zinc-500">
                Install or enable an EIP-1193 compatible browser wallet, then refresh the list.
              </p>
            </div>
          )}

          {error ? (
            <div
              className="
                mt-3 rounded-xl
                border
                border-rose-400/15
                bg-rose-400/[.06]
                px-3 py-2.5
                text-xs
                leading-5
                text-rose-300
              "
            >
              {error}
            </div>
          ) : null}

          <button
            type="button"
            onClick={() =>
              void onRefresh()
            }
            disabled={
              Boolean(
                connectingWalletId,
              )
            }
            className="
              mt-3 flex
              w-full
              items-center
              justify-center
              gap-2
              rounded-xl
              px-3 py-2.5
              text-xs
              text-zinc-500
              transition
              hover:bg-white/[.04]
              hover:text-zinc-300
              disabled:opacity-40
            "
          >
            <RefreshCw
              size={13}
            />
            Refresh wallet list
          </button>
        </div>

        <div
          className="
            border-t
            border-white/[.07]
            px-5 py-4
            text-center
            text-[11px]
            leading-5
            text-zinc-600
          "
        >
          VerdictGraph never receives your private keys. Transaction approval remains inside your selected wallet.
        </div>
      </div>
    </div>
  );
}

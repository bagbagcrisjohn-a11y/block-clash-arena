import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertCircle,
  Check,
  ChevronLeft,
  ChevronRight,
  Columns2,
  Eye,
  Lock,
  LogIn,
  RotateCw,
  ShoppingBag,
  Sparkles,
  X,
  Zap,
} from 'lucide-react';
import { soundEngine } from '../audio/soundEngine';
import { ThemePalette } from '../game/constants';
import {
  CheckoutAttemptResult,
  EquipSkinResult,
  PaymentMethodOption,
  PAYMENTS_UNAVAILABLE_MESSAGE,
} from '../game/payments';
import {
  CLASSIC_SKIN,
  formatPhp,
  getSkinById,
  PlayerSkinInventory,
  PREMIUM_SKIN_CATALOG,
  RARITY_COLORS,
  SkinRarity,
  TileSkinDefinition,
  TileSkinId,
} from '../game/skins';
import { PieceType } from '../game/types';
import { PiecePreviewCanvas } from './PiecePreviewCanvas';
import { SkinPromoArtwork } from './SkinPromoArtwork';

interface SkinShopModalProps {
  theme: ThemePalette;
  inventory: PlayerSkinInventory;
  gatewayConfigured: boolean;
  isSignedIn: boolean;
  userEmail: string | null;
  paymentBanner: { tone: 'info' | 'warning' | 'success'; text: string } | null;
  onDismissBanner: () => void;
  onSignIn: () => Promise<boolean>;
  onRequestPurchase: (
    skinId: TileSkinId,
    paymentMethod: PaymentMethodOption
  ) => Promise<CheckoutAttemptResult>;
  onEquipSkin: (skinId: TileSkinId) => Promise<EquipSkinResult>;
  onToggleReducedEffects: () => void;
  onClose: () => void;
}

type RarityFilter = 'All' | 'Rare' | 'Epic' | 'Legendary' | 'Mythic' | 'Ultimate' | 'Owned';

interface CheckoutModalState {
  skin: TileSkinDefinition;
  selectedMethod: PaymentMethodOption;
  statusCode: 'IDLE' | 'PAYMENTS_NOT_AVAILABLE' | 'AUTH_REQUIRED' | 'GATEWAY_ERROR' | 'OFFLINE';
  statusMessage: string | null;
}

const PAYMENT_METHOD_OPTIONS: Array<{ id: PaymentMethodOption; label: string }> = [
  { id: 'gcash', label: 'GCash' },
  { id: 'maya', label: 'Maya' },
  { id: 'qrph', label: 'QRPh' },
  { id: 'card', label: 'Card' },
];

const ALL_SHAPES: PieceType[] = ['I', 'O', 'T', 'S', 'Z', 'J', 'L'];
const FILTER_OPTIONS: RarityFilter[] = [
  'All',
  'Rare',
  'Epic',
  'Legendary',
  'Mythic',
  'Ultimate',
  'Owned',
];

export const SkinShopModal: React.FC<SkinShopModalProps> = ({
  theme,
  inventory,
  gatewayConfigured,
  isSignedIn,
  userEmail,
  paymentBanner,
  onDismissBanner,
  onSignIn,
  onRequestPurchase,
  onEquipSkin,
  onToggleReducedEffects,
  onClose,
}) => {
  const initialPreviewId: TileSkinId =
    inventory.equippedSkinId === 'classic'
      ? PREMIUM_SKIN_CATALOG[0].id
      : inventory.equippedSkinId;

  const [previewSkinId, setPreviewSkinId] = useState<TileSkinId>(initialPreviewId);
  const [previewRotation, setPreviewRotation] = useState<0 | 1 | 2 | 3>(0);
  const [compareMode, setCompareMode] = useState(false);
  const [activeFilter, setActiveFilter] = useState<RarityFilter>('All');
  const [checkoutModal, setCheckoutModal] = useState<CheckoutModalState | null>(null);
  const [busySkinId, setBusySkinId] = useState<TileSkinId | null>(null);
  const [equippingSkinId, setEquippingSkinId] = useState<TileSkinId | null>(null);
  const [inlineNotice, setInlineNotice] = useState<string | null>(null);

  const stageRef = useRef<HTMLDivElement | null>(null);

  const ownedSet = useMemo(() => new Set(inventory.ownedSkinIds), [inventory.ownedSkinIds]);
  const ownedPremiumCount = useMemo(
    () => PREMIUM_SKIN_CATALOG.filter((s) => ownedSet.has(s.id)).length,
    [ownedSet]
  );

  const previewSkin = useMemo(() => getSkinById(previewSkinId), [previewSkinId]);
  const equippedSkin = useMemo(
    () => getSkinById(inventory.equippedSkinId),
    [inventory.equippedSkinId]
  );

  const filteredCatalog = useMemo(() => {
    if (activeFilter === 'All') return PREMIUM_SKIN_CATALOG;
    if (activeFilter === 'Owned') {
      return PREMIUM_SKIN_CATALOG.filter((s) => ownedSet.has(s.id));
    }
    return PREMIUM_SKIN_CATALOG.filter((s) => s.rarity === (activeFilter as SkinRarity));
  }, [activeFilter, ownedSet]);

  // Close cleanly on Escape key
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (checkoutModal) {
          setCheckoutModal(null);
        } else {
          onClose();
        }
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [checkoutModal, onClose]);

  const handleSelectPreview = (skinId: TileSkinId, scrollToStage = false) => {
    soundEngine.unlock();
    soundEngine.playMove();
    setPreviewSkinId(skinId);
    if (scrollToStage && stageRef.current) {
      stageRef.current.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  };

  const handleCycleCollection = (delta: -1 | 1) => {
    soundEngine.unlock();
    soundEngine.playMove();
    const list = PREMIUM_SKIN_CATALOG;
    const currentIndex = list.findIndex((s) => s.id === previewSkinId);
    const nextIdx =
      currentIndex === -1
        ? 0
        : (currentIndex + delta + list.length) % list.length;
    setPreviewSkinId(list[nextIdx].id);
  };

  const handleRotatePreview = () => {
    soundEngine.unlock();
    soundEngine.playRotate();
    setPreviewRotation((prev) => ((prev + 1) % 4) as 0 | 1 | 2 | 3);
  };

  const handleEquip = async (skinId: TileSkinId) => {
    if (equippingSkinId) return;
    soundEngine.unlock();
    setEquippingSkinId(skinId);
    setInlineNotice(null);
    try {
      const result = await onEquipSkin(skinId);
      if (result.ok) {
        soundEngine.playHold();
      } else {
        setInlineNotice(
          result.message || 'Premium skin is locked. Complete a verified payment before equipping.'
        );
      }
    } finally {
      setEquippingSkinId(null);
    }
  };

  // Opens the payment method dialog — NEVER unlocks or equips any skin
  const handleOpenCheckout = (skin: TileSkinDefinition) => {
    if (ownedSet.has(skin.id)) return;
    soundEngine.unlock();
    setInlineNotice(gatewayConfigured ? null : PAYMENTS_UNAVAILABLE_MESSAGE);
    setCheckoutModal({
      skin,
      selectedMethod: 'gcash',
      statusCode: gatewayConfigured ? 'IDLE' : 'PAYMENTS_NOT_AVAILABLE',
      statusMessage: gatewayConfigured ? null : PAYMENTS_UNAVAILABLE_MESSAGE,
    });
  };

  // Selecting a payment method (GCash, Maya, QRPh, Card) NEVER grants ownership or equips the skin
  const handleSelectPaymentMethod = (method: PaymentMethodOption) => {
    setCheckoutModal((prev) => {
      if (!prev) return null;
      return {
        ...prev,
        selectedMethod: method,
        statusCode: gatewayConfigured ? 'IDLE' : 'PAYMENTS_NOT_AVAILABLE',
        statusMessage: gatewayConfigured ? null : PAYMENTS_UNAVAILABLE_MESSAGE,
      };
    });
  };

  const handleSubmitCheckout = async () => {
    if (!checkoutModal || busySkinId || ownedSet.has(checkoutModal.skin.id)) return;
    const { skin, selectedMethod } = checkoutModal;
    soundEngine.unlock();
    setBusySkinId(skin.id);

    try {
      const result = await onRequestPurchase(skin.id, selectedMethod);
      if (result.ok) {
        // Redirect to server-created Maya Checkout (Sandbox) session — never unlocks locally
        window.location.assign(result.redirectUrl);
        return;
      }

      if (result.code === 'ALREADY_OWNED') {
        setInlineNotice(result.message);
        setCheckoutModal(null);
        return;
      }

      const nextStatusCode = result.code;
      const displayMessage =
        nextStatusCode === 'PAYMENTS_NOT_AVAILABLE' || nextStatusCode === 'OFFLINE'
          ? PAYMENTS_UNAVAILABLE_MESSAGE
          : result.message;

      setInlineNotice(displayMessage);
      setCheckoutModal((prev) =>
        prev
          ? {
              ...prev,
              statusCode: nextStatusCode,
              statusMessage: displayMessage,
            }
          : null
      );
    } finally {
      setBusySkinId(null);
    }
  };

  const handleSignInAndRetry = async () => {
    if (!checkoutModal) return;
    const signedIn = await onSignIn();
    if (signedIn) {
      await handleSubmitCheckout();
    }
  };

  const isPreviewOwned = ownedSet.has(previewSkin.id);
  const isPreviewEquipped = inventory.equippedSkinId === previewSkin.id;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-2 sm:p-4 md:p-6 overflow-hidden"
      style={{
        backgroundColor: 'rgba(3, 6, 14, 0.86)',
        backdropFilter: 'blur(8px)',
      }}
      role="dialog"
      aria-modal="true"
      aria-label="Premium Tile Skin Marketplace"
    >
      <div
        className="w-full max-w-[1220px] max-h-[94dvh] rounded-2xl border flex flex-col overflow-hidden shadow-2xl"
        style={{
          backgroundColor: '#090D18',
          borderColor: 'rgba(56, 189, 248, 0.24)',
          color: '#F8FAFC',
        }}
      >
        {/* Top Marketplace Header */}
        <header
          className="px-4 sm:px-6 py-4 border-b flex flex-wrap items-center justify-between gap-3 shrink-0"
          style={{
            backgroundColor: '#0D1323',
            borderColor: 'rgba(148, 163, 184, 0.16)',
          }}
        >
          <div className="flex items-center gap-3 min-w-0">
            <div
              className="w-10 h-10 rounded-xl border flex items-center justify-center shrink-0"
              style={{
                backgroundColor: 'rgba(0, 240, 255, 0.1)',
                borderColor: 'rgba(0, 240, 255, 0.3)',
                color: '#00F0FF',
              }}
            >
              <Sparkles className="w-5 h-5" />
            </div>
            <div className="min-w-0">
              <h2 className="font-display text-lg sm:text-xl font-bold tracking-tight leading-tight truncate">
                Tile Skin Marketplace
              </h2>
              <p className="text-xs text-slate-400 truncate">
                {ownedPremiumCount} / {PREMIUM_SKIN_CATALOG.length} Premium Collections Owned · Equipped:{' '}
                <span className="font-semibold text-slate-200">{equippedSkin.name}</span>
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={onToggleReducedEffects}
              className="h-9 px-3 rounded-lg border text-xs font-semibold flex items-center gap-1.5 transition-colors cursor-pointer whitespace-nowrap"
              style={{
                backgroundColor: inventory.reducedEffects
                  ? 'rgba(250, 204, 21, 0.12)'
                  : 'rgba(30, 41, 59, 0.7)',
                borderColor: inventory.reducedEffects
                  ? 'rgba(250, 204, 21, 0.45)'
                  : 'rgba(148, 163, 184, 0.22)',
                color: inventory.reducedEffects ? '#FDE047' : '#CBD5E1',
              }}
              title="Reduce glow and particle animation load on low-end mobile devices"
            >
              <Zap className="w-3.5 h-3.5" />
              <span>{inventory.reducedEffects ? 'Effects: Reduced' : 'Effects: Full'}</span>
            </button>

            <button
              type="button"
              onClick={onClose}
              className="h-9 w-9 rounded-lg border flex items-center justify-center text-slate-300 hover:text-white transition-colors cursor-pointer"
              style={{
                backgroundColor: 'rgba(30, 41, 59, 0.7)',
                borderColor: 'rgba(148, 163, 184, 0.22)',
              }}
              aria-label="Close Tile Skin Marketplace"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </header>

        {/* Scrollable Body */}
        <div className="flex-1 overflow-y-auto px-4 sm:px-6 py-5 space-y-6">
          {/* Verified Payment Status / Unavailable Notice Banner */}
          {(paymentBanner || inlineNotice) && (
            <div
              className="rounded-xl border px-4 py-3 flex items-center justify-between gap-3 text-sm"
              style={
                paymentBanner?.tone === 'success'
                  ? {
                      backgroundColor: 'rgba(16, 185, 129, 0.12)',
                      borderColor: 'rgba(52, 211, 153, 0.45)',
                      color: '#A7F3D0',
                    }
                  : {
                      backgroundColor: 'rgba(245, 158, 11, 0.12)',
                      borderColor: 'rgba(251, 191, 36, 0.45)',
                      color: '#FDE68A',
                    }
              }
              role="status"
            >
              <div className="flex items-center gap-2.5 font-medium">
                {paymentBanner?.tone === 'success' ? (
                  <Check className="w-4 h-4 shrink-0 text-emerald-400" />
                ) : (
                  <AlertCircle className="w-4 h-4 shrink-0 text-amber-400" />
                )}
                <span>{inlineNotice || paymentBanner?.text}</span>
              </div>
              <button
                type="button"
                onClick={() => {
                  setInlineNotice(null);
                  onDismissBanner();
                }}
                className="text-xs font-semibold text-slate-200 hover:text-white cursor-pointer shrink-0"
              >
                Dismiss
              </button>
            </div>
          )}

          {/* LIVE INTERACTIVE 7-SHAPE PREVIEW STAGE */}
          <section
            ref={stageRef}
            aria-label="Live Interactive Skin Preview"
            className="rounded-2xl border overflow-hidden grid grid-cols-1 lg:grid-cols-12"
            style={{
              backgroundColor: '#0E1526',
              borderColor: `${previewSkin.accentColor}44`,
              boxShadow: inventory.reducedEffects
                ? 'none'
                : `0 12px 36px rgba(0, 0, 0, 0.45), 0 0 0 1px ${previewSkin.accentColor}1f`,
            }}
          >
            {/* Left 7 Cols: Promo Art + Interactive 7-Shape Live Canvas */}
            <div className="lg:col-span-7 flex flex-col border-b lg:border-b-0 lg:border-r border-slate-800/80">
              <SkinPromoArtwork
                skin={previewSkin}
                size="hero"
                reducedEffects={inventory.reducedEffects}
              />

              {/* Live 7 Clash Block Set Bar */}
              <div className="p-4 sm:p-5 space-y-3 bg-[#0B101E]">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="text-xs font-semibold tracking-wide text-slate-300">
                    Live 7-Piece Tile Set Preview · Rotation {previewRotation * 90}°
                  </span>

                  <div className="flex items-center gap-1.5">
                    <button
                      type="button"
                      onClick={() => handleCycleCollection(-1)}
                      className="h-8 w-8 rounded-lg border border-slate-700/80 bg-slate-900/80 flex items-center justify-center text-slate-300 hover:text-white cursor-pointer"
                      aria-label="Previous collection"
                    >
                      <ChevronLeft className="w-4 h-4" />
                    </button>
                    <button
                      type="button"
                      onClick={() => handleCycleCollection(1)}
                      className="h-8 w-8 rounded-lg border border-slate-700/80 bg-slate-900/80 flex items-center justify-center text-slate-300 hover:text-white cursor-pointer"
                      aria-label="Next collection"
                    >
                      <ChevronRight className="w-4 h-4" />
                    </button>
                    <button
                      type="button"
                      onClick={handleRotatePreview}
                      className="h-8 px-2.5 rounded-lg border border-slate-700/80 bg-slate-900/80 text-xs font-semibold text-slate-200 hover:text-white flex items-center gap-1.5 cursor-pointer whitespace-nowrap"
                    >
                      <RotateCw className="w-3.5 h-3.5" />
                      <span>Rotate</span>
                    </button>
                    {previewSkin.id !== equippedSkin.id && (
                      <button
                        type="button"
                        onClick={() => setCompareMode((v) => !v)}
                        className="h-8 px-2.5 rounded-lg border text-xs font-semibold flex items-center gap-1.5 cursor-pointer whitespace-nowrap transition-colors"
                        style={{
                          backgroundColor: compareMode
                            ? 'rgba(0, 240, 255, 0.14)'
                            : 'rgba(15, 23, 42, 0.85)',
                          borderColor: compareMode
                            ? 'rgba(0, 240, 255, 0.48)'
                            : 'rgba(51, 65, 85, 0.8)',
                          color: compareMode ? '#67E8F9' : '#CBD5E1',
                        }}
                      >
                        <Columns2 className="w-3.5 h-3.5" />
                        <span>Compare</span>
                      </button>
                    )}
                  </div>
                </div>

                {/* All 7 Shapes Rendered Live on Canvas */}
                <div className="grid grid-cols-7 gap-1.5 sm:gap-2">
                  {ALL_SHAPES.map((shape) => (
                    <div
                      key={shape}
                      className="rounded-lg border border-slate-800/90 bg-[#070B14] py-2 px-1 flex flex-col items-center gap-1"
                    >
                      <PiecePreviewCanvas
                        piece={shape}
                        theme={theme}
                        skinId={previewSkin.id}
                        reducedEffects={inventory.reducedEffects}
                        rotation={previewRotation}
                        animate={!inventory.reducedEffects}
                        cellSize={13}
                        width={60}
                        height={46}
                      />
                      <span className="font-mono-num text-[10px] font-bold text-slate-400">
                        {shape}
                      </span>
                    </div>
                  ))}
                </div>

                {/* Optional Side-by-Side Comparison vs Currently Equipped Skin */}
                {compareMode && previewSkin.id !== equippedSkin.id && (
                  <div className="pt-2.5 border-t border-slate-800/80 space-y-2">
                    <div className="text-[11px] font-semibold text-slate-400">
                      Currently Equipped · <span className="text-slate-200">{equippedSkin.name}</span>
                    </div>
                    <div className="grid grid-cols-7 gap-1.5 sm:gap-2">
                      {ALL_SHAPES.map((shape) => (
                        <div
                          key={`cmp-${shape}`}
                          className="rounded-lg border border-slate-800/70 bg-[#060911] py-1.5 px-1 flex items-center justify-center"
                        >
                          <PiecePreviewCanvas
                            piece={shape}
                            theme={theme}
                            skinId={equippedSkin.id}
                            reducedEffects={inventory.reducedEffects}
                            rotation={previewRotation}
                            animate={!inventory.reducedEffects}
                            cellSize={10}
                            width={48}
                            height={34}
                          />
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </div>

            {/* Right 5 Cols: Contiguous Decision & Purchase Panel */}
            <div className="lg:col-span-5 p-5 sm:p-6 flex flex-col justify-between gap-5">
              <div className="space-y-3.5">
                <div className="flex items-center justify-between gap-2 text-xs font-semibold">
                  <span style={{ color: previewSkin.rarityColor }}>
                    {previewSkin.rarity} · {previewSkin.materialLabel}
                  </span>
                  <span className="text-slate-400">
                    {isPreviewEquipped
                      ? 'Equipped'
                      : isPreviewOwned
                        ? 'Owned'
                        : 'Unlockable'}
                  </span>
                </div>

                <div>
                  <h3 className="font-display text-2xl sm:text-3xl font-bold tracking-tight text-white">
                    {previewSkin.name}
                  </h3>
                  <p className="text-sm font-medium mt-1" style={{ color: previewSkin.accentColor }}>
                    {previewSkin.tagline}
                  </p>
                </div>

                <p className="text-sm leading-relaxed text-slate-300">
                  {previewSkin.description}
                </p>

                <div className="pt-2 border-t border-slate-800/90 grid grid-cols-2 gap-2 text-xs text-slate-400">
                  <div>
                    <span className="text-slate-500 block">Coverage</span>
                    <span className="text-slate-200 font-medium">All 7 Shapes · Board &amp; HUD</span>
                  </div>
                  <div>
                    <span className="text-slate-500 block">Shader FX</span>
                    <span className="text-slate-200 font-medium">
                      {previewSkin.hasParticles
                        ? 'Animated Material + Particles'
                        : previewSkin.isAnimated
                          ? 'Animated Lighting & Sheen'
                          : 'Standard Theme Palette'}
                    </span>
                  </div>
                </div>
              </div>

              {/* Price & Primary CTA */}
              <div className="space-y-3 pt-3 border-t border-slate-800/90">
                <div className="flex items-baseline justify-between gap-3">
                  <div>
                    <span className="text-[11px] font-medium text-slate-400 block">
                      {isPreviewOwned ? 'Collection Status' : 'One-Time Unlock Price'}
                    </span>
                    <span className="font-mono-num text-3xl font-bold text-white">
                      {isPreviewOwned ? 'Owned' : formatPhp(previewSkin.pricePhp)}
                    </span>
                  </div>
                  {!isPreviewOwned && (
                    <span className="text-xs text-slate-400">
                      Philippine Peso (PHP)
                    </span>
                  )}
                </div>

                {!isPreviewOwned ? (
                  <button
                    type="button"
                    disabled={busySkinId !== null}
                    onClick={() => handleOpenCheckout(previewSkin)}
                    className="w-full h-12 px-5 rounded-xl font-display text-sm font-bold tracking-wide flex items-center justify-center gap-2 transition-transform active:scale-[0.99] cursor-pointer disabled:opacity-60"
                    style={{
                      backgroundColor: previewSkin.accentColor,
                      color: '#060A12',
                      boxShadow: inventory.reducedEffects
                        ? 'none'
                        : `0 6px 24px ${previewSkin.accentColor}44`,
                    }}
                  >
                    <ShoppingBag className="w-4 h-4" />
                    <span>Purchase Collection · {formatPhp(previewSkin.pricePhp)}</span>
                  </button>
                ) : isPreviewEquipped ? (
                  <div
                    className="w-full h-12 px-5 rounded-xl border font-display text-sm font-bold tracking-wide flex items-center justify-center gap-2"
                    style={{
                      backgroundColor: 'rgba(16, 185, 129, 0.12)',
                      borderColor: 'rgba(52, 211, 153, 0.45)',
                      color: '#6EE7B7',
                    }}
                  >
                    <Check className="w-4 h-4" />
                    <span>Currently Equipped in Arena</span>
                  </div>
                ) : (
                  <button
                    type="button"
                    disabled={equippingSkinId !== null}
                    onClick={() => void handleEquip(previewSkin.id)}
                    className="w-full h-12 px-5 rounded-xl font-display text-sm font-bold tracking-wide flex items-center justify-center gap-2 transition-transform active:scale-[0.99] cursor-pointer disabled:opacity-60"
                    style={{
                      backgroundColor: '#22D3EE',
                      color: '#04121B',
                    }}
                  >
                    <Check className="w-4 h-4" />
                    <span>
                      {equippingSkinId === previewSkin.id
                        ? 'Verifying Ownership...'
                        : `Equip ${previewSkin.name}`}
                    </span>
                  </button>
                )}
              </div>
            </div>
          </section>

          {/* FILTER BAR & CLASSIC DEFAULT SWITCH */}
          <div className="flex flex-wrap items-center justify-between gap-3 pt-1">
            <div
              className="flex flex-wrap items-center gap-1.5"
              role="tablist"
              aria-label="Filter tile collections by rarity"
            >
              {FILTER_OPTIONS.map((filter) => {
                const active = activeFilter === filter;
                const accent =
                  filter === 'All' || filter === 'Owned'
                    ? '#22D3EE'
                    : RARITY_COLORS[filter as SkinRarity];
                return (
                  <button
                    key={filter}
                    type="button"
                    role="tab"
                    aria-selected={active}
                    onClick={() => setActiveFilter(filter)}
                    className="h-8 px-3 rounded-lg border text-xs font-semibold transition-colors cursor-pointer whitespace-nowrap"
                    style={{
                      backgroundColor: active ? `${accent}22` : 'rgba(15, 23, 42, 0.7)',
                      borderColor: active ? accent : 'rgba(148, 163, 184, 0.2)',
                      color: active ? '#FFFFFF' : '#94A3B8',
                    }}
                  >
                    {filter}
                    {filter === 'Owned' ? ` (${ownedPremiumCount})` : ''}
                  </button>
                );
              })}
            </div>

            {/* Classic Theme-Matched Default Re-Equip */}
            <button
              type="button"
              onClick={() => void handleEquip(CLASSIC_SKIN.id)}
              disabled={inventory.equippedSkinId === CLASSIC_SKIN.id || equippingSkinId !== null}
              className="h-8 px-3 rounded-lg border text-xs font-semibold transition-colors cursor-pointer whitespace-nowrap disabled:cursor-default"
              style={{
                backgroundColor:
                  inventory.equippedSkinId === CLASSIC_SKIN.id
                    ? 'rgba(16, 185, 129, 0.12)'
                    : 'rgba(15, 23, 42, 0.7)',
                borderColor:
                  inventory.equippedSkinId === CLASSIC_SKIN.id
                    ? 'rgba(52, 211, 153, 0.4)'
                    : 'rgba(148, 163, 184, 0.22)',
                color:
                  inventory.equippedSkinId === CLASSIC_SKIN.id ? '#6EE7B7' : '#CBD5E1',
              }}
            >
              {inventory.equippedSkinId === CLASSIC_SKIN.id
                ? 'Classic Arena Equipped'
                : 'Use Classic Arena (Free)'}
            </button>
          </div>

          {/* PRODUCT CATALOG GRID */}
          {filteredCatalog.length === 0 ? (
            <div className="rounded-xl border border-slate-800 bg-[#0D1323] p-10 text-center space-y-2">
              <p className="font-display text-base font-bold text-white">
                No owned premium collections yet
              </p>
              <p className="text-xs text-slate-400">
                Select any collection below to inspect its 7 live block shapes and preview it in motion.
              </p>
              <button
                type="button"
                onClick={() => setActiveFilter('All')}
                className="mt-2 h-9 px-4 rounded-lg bg-cyan-400 text-slate-950 text-xs font-bold cursor-pointer"
              >
                Browse All 10 Collections
              </button>
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5 pb-2">
              {filteredCatalog.map((skin) => {
                const owned = ownedSet.has(skin.id);
                const equipped = inventory.equippedSkinId === skin.id;
                const isSelectedPreview = previewSkinId === skin.id;

                return (
                  <article
                    key={skin.id}
                    className="rounded-2xl border flex flex-col overflow-hidden transition-all"
                    style={{
                      backgroundColor: '#0E1526',
                      borderColor: equipped
                        ? 'rgba(52, 211, 153, 0.55)'
                        : isSelectedPreview
                          ? `${skin.accentColor}88`
                          : 'rgba(148, 163, 184, 0.16)',
                      boxShadow:
                        isSelectedPreview && !inventory.reducedEffects
                          ? `0 0 24px ${skin.accentColor}24`
                          : 'none',
                    }}
                  >
                    {/* Large Promo Artwork Card Header */}
                    <button
                      type="button"
                      onClick={() => handleSelectPreview(skin.id, true)}
                      className="w-full text-left cursor-pointer focus-visible:outline-2 focus-visible:outline-offset-2"
                      aria-label={`Preview ${skin.name} collection`}
                    >
                      <SkinPromoArtwork
                        skin={skin}
                        size="card"
                        reducedEffects={inventory.reducedEffects}
                      />
                    </button>

                    {/* Card Details */}
                    <div className="p-4 flex-1 flex flex-col justify-between gap-4">
                      <div className="space-y-1.5">
                        <div className="flex items-center justify-between gap-2 text-xs font-semibold">
                          <span style={{ color: skin.rarityColor }}>{skin.rarity}</span>
                          <span
                            className="font-mono-num font-bold"
                            style={{
                              color: equipped
                                ? '#6EE7B7'
                                : owned
                                  ? '#CBD5E1'
                                  : '#FFFFFF',
                            }}
                          >
                            {equipped
                              ? 'Equipped'
                              : owned
                                ? 'Owned'
                                : formatPhp(skin.pricePhp)}
                          </span>
                        </div>

                        <h3 className="font-display text-lg font-bold text-white leading-snug">
                          {skin.name}
                        </h3>

                        <p className="text-xs leading-relaxed text-slate-400 line-clamp-2">
                          {skin.description}
                        </p>
                      </div>

                      {/* Clean Single-Line Action Row */}
                      <div className="grid grid-cols-2 gap-2 pt-2 border-t border-slate-800/80">
                        <button
                          type="button"
                          onClick={() => handleSelectPreview(skin.id, true)}
                          className="h-9 px-3 rounded-lg border text-xs font-semibold flex items-center justify-center gap-1.5 transition-colors cursor-pointer whitespace-nowrap"
                          style={{
                            backgroundColor: isSelectedPreview
                              ? 'rgba(56, 189, 248, 0.14)'
                              : 'rgba(15, 23, 42, 0.85)',
                            borderColor: isSelectedPreview
                              ? 'rgba(56, 189, 248, 0.5)'
                              : 'rgba(148, 163, 184, 0.22)',
                            color: isSelectedPreview ? '#7DD3FC' : '#E2E8F0',
                          }}
                        >
                          <Eye className="w-3.5 h-3.5 shrink-0" />
                          <span>{isSelectedPreview ? 'Viewing' : 'Preview'}</span>
                        </button>

                        {!owned ? (
                          <button
                            type="button"
                            disabled={busySkinId !== null}
                            onClick={() => handleOpenCheckout(skin)}
                            className="h-9 px-3 rounded-lg font-semibold text-xs flex items-center justify-center gap-1.5 transition-transform active:scale-[0.98] cursor-pointer whitespace-nowrap disabled:opacity-60"
                            style={{
                              backgroundColor: skin.accentColor,
                              color: '#060A12',
                            }}
                          >
                            <ShoppingBag className="w-3.5 h-3.5 shrink-0" />
                            <span>Buy {formatPhp(skin.pricePhp)}</span>
                          </button>
                        ) : equipped ? (
                          <div
                            className="h-9 px-3 rounded-lg border text-xs font-semibold flex items-center justify-center gap-1.5 whitespace-nowrap"
                            style={{
                              backgroundColor: 'rgba(16, 185, 129, 0.12)',
                              borderColor: 'rgba(52, 211, 153, 0.45)',
                              color: '#6EE7B7',
                            }}
                          >
                            <Check className="w-3.5 h-3.5 shrink-0" />
                            <span>Equipped</span>
                          </div>
                        ) : (
                          <button
                            type="button"
                            disabled={equippingSkinId !== null}
                            onClick={() => void handleEquip(skin.id)}
                            className="h-9 px-3 rounded-lg font-semibold text-xs flex items-center justify-center gap-1.5 transition-colors cursor-pointer whitespace-nowrap disabled:opacity-60"
                            style={{
                              backgroundColor: '#22D3EE',
                              color: '#04121B',
                            }}
                          >
                            <Check className="w-3.5 h-3.5 shrink-0" />
                            <span>{equippingSkinId === skin.id ? 'Checking...' : 'Equip'}</span>
                          </button>
                        )}
                      </div>
                    </div>
                  </article>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* SERVER-VERIFIED PAYMENT CHECKOUT MODAL (SELECTING ANY METHOD NEVER UNLOCKS OR EQUIPS) */}
      {checkoutModal && (
        <div
          className="fixed inset-0 z-[60] flex items-center justify-center p-4"
          style={{
            backgroundColor: 'rgba(2, 4, 10, 0.82)',
            backdropFilter: 'blur(6px)',
          }}
          role="dialog"
          aria-modal="true"
          aria-label={`Checkout for ${checkoutModal.skin.name}`}
        >
          <div
            className="w-full max-w-md rounded-2xl border overflow-hidden shadow-2xl"
            style={{
              backgroundColor: '#0E1526',
              borderColor: `${checkoutModal.skin.accentColor}66`,
              color: '#F8FAFC',
            }}
          >
            <SkinPromoArtwork
              skin={checkoutModal.skin}
              size="compact"
              reducedEffects={inventory.reducedEffects}
            />

            <div className="p-5 space-y-4">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <div
                    className="text-xs font-semibold"
                    style={{ color: checkoutModal.skin.rarityColor }}
                  >
                    {checkoutModal.skin.rarity} · {checkoutModal.skin.materialLabel}
                  </div>
                  <h3 className="font-display text-xl font-bold text-white mt-0.5">
                    {checkoutModal.skin.name}
                  </h3>
                </div>
                <div className="text-right shrink-0">
                  <div className="text-[10px] text-slate-400">Total</div>
                  <div className="font-mono-num text-xl font-bold text-white">
                    {formatPhp(checkoutModal.skin.pricePhp)}
                  </div>
                </div>
              </div>

              {/* Payment Method Selector — strictly selection only, NEVER grants ownership */}
              <div className="space-y-2">
                <span className="text-xs font-semibold text-slate-300 block">
                  Payment Method (Maya Checkout)
                </span>
                <div className="grid grid-cols-4 gap-2">
                  {PAYMENT_METHOD_OPTIONS.map((option) => {
                    const selected = checkoutModal.selectedMethod === option.id;
                    return (
                      <button
                        key={option.id}
                        type="button"
                        onClick={() => handleSelectPaymentMethod(option.id)}
                        className="h-9 rounded-lg border text-xs font-semibold transition-colors cursor-pointer whitespace-nowrap"
                        style={{
                          backgroundColor: selected
                            ? `${checkoutModal.skin.accentColor}22`
                            : 'rgba(15, 23, 42, 0.85)',
                          borderColor: selected
                            ? checkoutModal.skin.accentColor
                            : 'rgba(148, 163, 184, 0.22)',
                          color: selected ? '#FFFFFF' : '#94A3B8',
                        }}
                      >
                        {option.label}
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Server Payment Status Notice */}
              <div
                className="rounded-xl border px-3.5 py-3 flex items-start gap-2.5 text-sm"
                style={{
                  backgroundColor: 'rgba(245, 158, 11, 0.1)',
                  borderColor: 'rgba(251, 191, 36, 0.4)',
                  color: '#FEF3C7',
                }}
              >
                <Lock className="w-4 h-4 shrink-0 text-amber-400 mt-0.5" />
                <div className="space-y-1">
                  <div className="font-semibold text-white">
                    {checkoutModal.statusMessage ||
                      (gatewayConfigured
                        ? 'Server-verified Maya Sandbox Checkout'
                        : PAYMENTS_UNAVAILABLE_MESSAGE)}
                  </div>
                  <p className="text-xs text-slate-300 leading-relaxed">
                    {checkoutModal.statusCode === 'AUTH_REQUIRED'
                      ? 'Sign in with Google so your verified server-side payment record stays linked to your account.'
                      : 'Selecting a payment method does not unlock skins. Ownership is granted only after verified server-side payment confirmation.'}
                  </p>
                  {isSignedIn && userEmail && (
                    <p className="text-[11px] text-slate-400">Signed in as {userEmail}</p>
                  )}
                </div>
              </div>

              <div className="grid grid-cols-2 gap-2.5 pt-1">
                <button
                  type="button"
                  onClick={() => setCheckoutModal(null)}
                  className="h-11 rounded-xl border border-slate-700 bg-slate-900/70 text-xs font-semibold text-slate-200 hover:text-white cursor-pointer"
                >
                  Close
                </button>

                {checkoutModal.statusCode === 'AUTH_REQUIRED' ? (
                  <button
                    type="button"
                    onClick={() => void handleSignInAndRetry()}
                    className="h-11 rounded-xl font-display text-xs font-bold tracking-wide flex items-center justify-center gap-1.5 cursor-pointer"
                    style={{
                      backgroundColor: checkoutModal.skin.accentColor,
                      color: '#060A12',
                    }}
                  >
                    <LogIn className="w-4 h-4" />
                    <span>Sign In with Google</span>
                  </button>
                ) : (
                  <button
                    type="button"
                    disabled={busySkinId !== null}
                    onClick={() => void handleSubmitCheckout()}
                    className="h-11 rounded-xl font-display text-xs font-bold tracking-wide flex items-center justify-center gap-1.5 cursor-pointer disabled:opacity-60"
                    style={{
                      backgroundColor: gatewayConfigured
                        ? checkoutModal.skin.accentColor
                        : '#1E293B',
                      color: gatewayConfigured ? '#060A12' : '#94A3B8',
                    }}
                  >
                    <ShoppingBag className="w-3.5 h-3.5" />
                    <span>
                      {busySkinId === checkoutModal.skin.id
                        ? 'Checking...'
                        : gatewayConfigured
                          ? `Pay ${formatPhp(checkoutModal.skin.pricePhp)}`
                          : 'Payments Unavailable'}
                    </span>
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

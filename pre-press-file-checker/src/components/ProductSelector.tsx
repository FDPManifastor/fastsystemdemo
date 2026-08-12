/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { PrintProduct, StickerShape } from '../types';
import { 
  FileText, 
  Image as ImageIcon, 
  Sparkles, 
  RefreshCw, 
  ShieldAlert, 
  ChevronDown, 
  ChevronUp, 
  CreditCard,
  ArrowLeft,
  ArrowRight,
  Check
} from 'lucide-react';

export const CATEGORIES = [
  { 
    id: 'Flyer', 
    name: 'Flyers & Folders', 
    desc: 'Promotiemateriaal, hand-outs, brochures en folders.', 
    iconName: 'file-text', 
    badge: 'Enkel- of Dubbelzijdig' 
  },
  { 
    id: 'Poster', 
    name: 'Posters', 
    desc: 'Grootformaat affiches en reclameposters om op te vallen.', 
    iconName: 'image', 
    badge: 'Hoge Resolutie' 
  },
  { 
    id: 'Sticker', 
    name: 'Vinyl Stickers', 
    desc: 'Weerbestendige stickers op maat, rond, vierkant of contoursnede.', 
    iconName: 'sticker', 
    badge: 'Contoursnede Opties' 
  },
  { 
    id: 'Visitekaart', 
    name: 'Visitekaarten', 
    desc: 'Professionele visitekaarten met standaard 85x55mm formaat.', 
    iconName: 'rectangle-horizontal', 
    badge: 'Standaard of Custom' 
  },
  { 
    id: 'Banner', 
    name: 'Rollup Banners', 
    desc: 'Perfecte presentatie voor beurzen en winkels.', 
    iconName: 'file-text', 
    badge: 'Inclusief cassette' 
  },
];

const getCategoryIcon = (iconName: string) => {
  switch (iconName) {
    case 'file-text':
      return <FileText className="w-8 h-8 text-blue-600" />;
    case 'image':
      return <ImageIcon className="w-8 h-8 text-indigo-600" />;
    case 'rectangle-horizontal':
      return <CreditCard className="w-8 h-8 text-emerald-600" />;
    case 'sticker':
      return <Sparkles className="w-8 h-8 text-amber-600" />;
    default:
      return <FileText className="w-8 h-8 text-slate-600" />;
  }
};

const getProductIcon = (iconName: string) => {
  switch (iconName) {
    case 'file-text':
      return <FileText className="w-5 h-5" />;
    case 'image':
      return <ImageIcon className="w-5 h-5" />;
    case 'rectangle-horizontal':
      return <CreditCard className="w-5 h-5" />;
    case 'sticker':
      return (
        <span className="flex items-center justify-center w-5 h-5 font-bold text-[10px] bg-slate-100 rounded-full text-slate-800 border border-slate-300">
          STK
        </span>
      );
    default:
      return <FileText className="w-5 h-5" />;
  }
};

interface ProductCategorySelectorProps {
  onSelectCategory: (categoryId: string) => void;
  selectedCategory: string | null;
}

export function ProductCategorySelector({
  onSelectCategory,
  selectedCategory
}: ProductCategorySelectorProps) {
  return (
    <div className="bg-white rounded-2xl border border-slate-200 p-6 sm:p-8 shadow-xs space-y-6">
      <div className="text-center max-w-2xl mx-auto space-y-2">
        <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-black bg-red-50 text-brand-red uppercase tracking-wider animate-pulse border border-red-100">
          Stap 1 van 4
        </span>
        <h3 className="text-xl sm:text-2xl font-black text-slate-900 tracking-tight">Kies uw gewenste product</h3>
        <p className="text-sm text-slate-500 leading-relaxed font-sans">
          Selecteer hieronder welk type drukwerk u wilt laten controleren.
        </p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 pt-2">
        {CATEGORIES.map((cat) => {
          const isSelected = selectedCategory === cat.id;
          return (
            <button
              key={cat.id}
              type="button"
              onClick={() => onSelectCategory(cat.id)}
              className={`group relative text-left p-5 rounded-2xl border transition-all duration-300 cursor-pointer flex flex-col justify-between h-full min-h-[160px] ${
                isSelected 
                  ? 'border-brand-red bg-red-50/10 shadow-sm' 
                  : 'border-slate-200 hover:border-brand-red hover:bg-red-50/10 hover:shadow-md'
              }`}
            >
              <div>
                <div className="flex items-center justify-between mb-4">
                  <div className={`p-3 rounded-xl transition-all border ${
                    isSelected 
                      ? 'bg-red-100 border-red-200' 
                      : 'bg-slate-50 group-hover:bg-red-50 border-slate-100 group-hover:border-red-100'
                  }`}>
                    {getCategoryIcon(cat.iconName)}
                  </div>
                  <span className="text-[10px] font-bold text-slate-400 group-hover:text-brand-red bg-slate-100 group-hover:bg-red-50 px-2.5 py-1 rounded-full uppercase tracking-wider">
                    {cat.badge}
                  </span>
                </div>
                <h4 className="font-bold text-base text-slate-800 group-hover:text-blue-900 leading-snug">
                  {cat.name}
                </h4>
                <p className="text-xs text-slate-500 mt-1.5 leading-relaxed font-medium font-sans">
                  {cat.desc}
                </p>
              </div>

              <div className="mt-4 flex items-center gap-1.5 text-xs font-bold text-brand-red group-hover:text-brand-red-dark opacity-0 group-hover:opacity-100 transition-opacity">
                <span>Kies dit product</span>
                <ArrowRight className="w-4 h-4 transition-transform group-hover:translate-x-1" />
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}

interface ProductFormatSelectorProps {
  products: PrintProduct[];
  selectedProduct: PrintProduct;
  onSelectProduct: (product: PrintProduct) => void;
  customWidth: number;
  customHeight: number;
  onChangeWidth: (width: number) => void;
  onChangeHeight: (height: number) => void;
  stickerShape: StickerShape;
  onSetStickerShape: (shape: StickerShape) => void;
  printSides: 'single' | 'double';
  onChangePrintSides: (sides: 'single' | 'double') => void;
  onNextStep?: () => void;
  onPrevStep?: () => void;
}

export function ProductFormatSelector({
  products,
  selectedProduct,
  onSelectProduct,
  customWidth,
  customHeight,
  onChangeWidth,
  onChangeHeight,
  stickerShape,
  onSetStickerShape,
  printSides,
  onChangePrintSides,
  onNextStep,
  onPrevStep,
}: ProductFormatSelectorProps) {
  const [isSidesOpen, setIsSidesOpen] = React.useState(true);
  const selectedCategory = selectedProduct.category;

  const handleSwapOrientation = () => {
    const temp = customWidth;
    onChangeWidth(customHeight);
    onChangeHeight(temp);
  };

  const categoryProducts = products.filter((p) => p.category === selectedCategory);

  return (
    <div className="bg-white rounded-2xl border border-slate-200 p-6 sm:p-8 shadow-xs space-y-6">
      
      {/* Top Navigation & Breadcrumb */}
      <div className="flex items-center justify-between gap-4 flex-wrap pb-4 border-b border-slate-100">
        <button
          type="button"
          onClick={onPrevStep}
          className="inline-flex items-center gap-2 text-xs font-extrabold text-slate-600 hover:text-brand-red transition-colors bg-slate-50 hover:bg-slate-100 border border-slate-200/80 px-3.5 py-2 rounded-xl cursor-pointer"
        >
          <ArrowLeft className="w-4 h-4" />
          <span>Kies een ander product-type</span>
        </button>

        <span className="text-xs font-bold text-slate-400 bg-slate-50 border border-slate-200/50 px-3 py-1.5 rounded-lg select-none">
          Productgroep: <strong className="text-slate-800 font-extrabold">{CATEGORIES.find(c => c.id === selectedCategory)?.name}</strong>
        </span>
      </div>

      {/* Header info */}
      <div className="space-y-1">
        <h3 className="text-lg sm:text-xl font-black text-slate-900 tracking-tight flex items-center gap-2">
          <span>Stap 2: Kies uw formaat & specificaties</span>
        </h3>
        <p className="text-xs sm:text-sm text-slate-500 font-medium font-sans">
          Kies een van de standaard formaten of stel zelf uw afmetingen in millimeters in.
        </p>
      </div>

      {/* Preset Sizes list for this category */}
      <div className="space-y-3">
        <h4 className="text-xs font-bold text-slate-500 uppercase tracking-wider">
          Beschikbare formaten
        </h4>
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
          {categoryProducts.map((p) => {
            const isSelected = selectedProduct.id === p.id;
            return (
              <button
                key={p.id}
                type="button"
                onClick={() => onSelectProduct(p)}
                className={`group relative text-left p-4 rounded-xl border-2 transition-all duration-200 cursor-pointer overflow-hidden flex items-center gap-3.5 ${
                  isSelected
                    ? 'border-emerald-600 bg-emerald-50/40 text-emerald-950 shadow-xs font-bold'
                    : 'border-slate-150 hover:border-slate-350 bg-slate-50/30 text-slate-600'
                }`}
              >
                {isSelected && (
                  <div className="absolute right-0 top-0 w-6 h-6 flex items-center justify-center bg-emerald-600 text-white rounded-bl-lg">
                    <Check className="w-3.5 h-3.5" />
                  </div>
                )}
                
                <div className={`p-2 rounded-lg inline-block shrink-0 ${
                  isSelected ? 'bg-emerald-100 text-emerald-700' : 'bg-white text-slate-500 group-hover:text-slate-850 border border-slate-100'
                }`}>
                  {getProductIcon(p.iconName)}
                </div>
                
                <div className="space-y-0.5 min-w-0">
                  <span className="block font-bold text-xs sm:text-sm tracking-tight truncate group-hover:text-slate-900 transition-colors">
                    {p.name}
                  </span>
                  <span className="block text-[10px] sm:text-xs font-mono text-slate-400">
                    {p.widthMm} × {p.heightMm} mm
                  </span>
                </div>
              </button>
            );
          })}
        </div>
      </div>

      {/* Dynamic Dimensions & Advanced customization panel */}
      <div className="p-5 bg-slate-50 border border-slate-200/60 rounded-2xl space-y-4">
        
        <div className="flex items-center justify-between gap-4 flex-wrap pb-3 border-b border-slate-200/50">
          <div>
            <h4 className="text-xs font-bold font-sans text-slate-850 uppercase tracking-wider flex items-center gap-1.5">
              <span className="w-1.5 h-1.5 rounded-full bg-brand-red"></span>
              Aanpassen Formaat / Afmetingen
            </h4>
            <p className="text-[11px] text-slate-550 font-medium font-sans">
              Geef handmatig de afmetingen in millimeters op om een eigen formaat te definiëren.
            </p>
          </div>

          <span className="px-2.5 py-1 text-[10px] font-bold uppercase rounded-md bg-white border border-slate-200 text-slate-600 shadow-3xs">
            Geselecteerd: {selectedProduct.name}
          </span>
        </div>        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 items-center">
          {/* Dimensions Inputs */}
          <div className="flex items-center gap-2">
            <div className="grow">
              <label htmlFor="selector-width" className="block text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1 select-none">
                Breedte
              </label>
              <div className="relative">
                <input
                  id="selector-width"
                  type="number"
                  min="5"
                  max="5000"
                  value={customWidth || ''}
                  onChange={(e) => onChangeWidth(Math.max(1, parseInt(e.target.value) || 0))}
                  className="w-full bg-white border border-slate-250 rounded-lg px-3 py-2 text-sm font-bold text-slate-800 focus:outline-hidden focus:border-brand-red focus:ring-1 focus:ring-brand-red shadow-3xs"
                />
              </div>
            </div>
            
            <span className="text-slate-400 font-extrabold pt-4 text-xs select-none">×</span>
            
            <div className="grow">
              <label htmlFor="selector-height" className="block text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1 select-none">
                Hoogte
              </label>
              <div className="relative">
                <input
                  id="selector-height"
                  type="number"
                  min="5"
                  max="5000"
                  value={customHeight || ''}
                  onChange={(e) => onChangeHeight(Math.max(1, parseInt(e.target.value) || 0))}
                  className="w-full bg-white border border-slate-250 rounded-lg px-3 py-2 text-sm font-bold text-slate-800 focus:outline-hidden focus:border-brand-red focus:ring-1 focus:ring-brand-red shadow-3xs"
                />
              </div>
            </div>
            <span className="text-slate-555 font-bold pt-4 text-xs select-none">mm</span>
 
            <button
              onClick={handleSwapOrientation}
              type="button"
              title="Wissel breedte en hoogte (Staand / Liggend)"
              className="mt-4 p-2.5 rounded-lg bg-white border border-slate-250 text-slate-600 hover:text-brand-red hover:border-brand-red hover:bg-red-50/50 transition-all flex items-center justify-center cursor-pointer shadow-3xs shrink-0"
            >
              <RefreshCw className="w-4 h-4" />
            </button>
          </div>
 
          <div className="text-[11px] text-slate-500 leading-relaxed font-sans bg-white p-3 rounded-lg border border-slate-200/50">
            <strong>Bleed Tip:</strong> Lever uw ontwerp bij voorkeur aan met <strong>3 mm afloop (bleed)</strong> rondom om snijranden te voorkomen.
          </div>
        </div>

        {/* Sticker Shapes option */}
        {selectedCategory === 'Sticker' && (
          <div className="border-t border-slate-200/60 pt-4 space-y-3.5">
            <div className="flex items-center justify-between gap-4 flex-wrap">
              <div className="space-y-0.5">
                <h4 className="text-xs font-bold font-sans text-slate-800 uppercase tracking-wider flex items-center gap-1.5">
                  <span className="w-1.5 h-1.5 rounded-full bg-brand-red"></span>
                  Sticker Contourvorm
                </h4>
                <p className="text-[11px] text-slate-500 font-medium font-sans">
                  Kies hoe we uw stickers moeten contoursnijden om de snijranden in de preflight te tonen.
                </p>
              </div>
              
              {(customWidth < 30 || customHeight < 30) && (
                <div className="inline-flex items-center gap-1.5 px-3 py-1 bg-rose-50 text-rose-800 border border-rose-100 rounded-lg text-[10px] font-bold animate-pulse font-sans">
                  <ShieldAlert className="w-3.5 h-3.5 text-rose-600" />
                  <span>Minimaal 30x30mm!</span>
                </div>
              )}
            </div>
 
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              {[
                { id: 'rectangle', label: 'Rechthoek', desc: 'Rechte hoeken' },
                { id: 'circle', label: 'Rond / Cirkel', desc: 'Cirkelvormig' },
                { id: 'oval', label: 'Ovaal', desc: 'Ovale contoursnede' },
                { id: 'die-cut', label: 'Die-Cut', desc: 'Eigen contouren' },
              ].map((shape) => {
                const active = stickerShape === shape.id;
                return (
                  <button
                    key={shape.id}
                    type="button"
                    onClick={() => onSetStickerShape(shape.id as StickerShape)}
                    className={`p-3.5 rounded-xl border-2 text-left cursor-pointer transition-all ${
                      active
                        ? 'border-brand-red bg-red-50/50 text-slate-900 shadow-3xs font-bold scale-[1.01]'
                        : 'border-slate-200 hover:border-slate-300 bg-white text-slate-600 shadow-3xs hover:shadow-2xs'
                    }`}
                  >
                    <span className="block text-xs font-bold leading-none mb-1">
                      {shape.label}
                    </span>
                    <span className="block text-[10px] text-slate-400 font-medium font-sans">
                      {shape.desc}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {/* Print Sides choice */}
        <div className="border-t border-slate-200/60 pt-4 space-y-3">
          <button
            type="button"
            onClick={() => setIsSidesOpen(!isSidesOpen)}
            className="w-full flex items-center justify-between text-left py-1 group/btn select-none cursor-pointer focus:outline-hidden"
          >
            <div className="space-y-0.5 text-left">
              <h4 className="text-xs font-bold font-sans text-slate-800 uppercase tracking-wider flex items-center gap-1.5">
                <span className="w-1.5 h-1.5 rounded-full bg-brand-red animate-pulse"></span>
                Bedrukking (Enkel- of Dubbelzijdig)
              </h4>
              <p className="text-[11px] text-slate-550 font-medium font-sans">
                Kies of we uw bestand enkelzijdig of dubbelzijdig moeten printen.
              </p>
            </div>
            <div className="p-1 rounded-md bg-white border border-slate-200 text-slate-500 group-hover/btn:text-brand-red transition-colors">
              {isSidesOpen ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
            </div>
          </button>

          {isSidesOpen && (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
              <button
                type="button"
                onClick={() => onChangePrintSides('single')}
                className={`p-4 rounded-xl border-2 text-left cursor-pointer transition-all ${
                  printSides === 'single'
                    ? 'border-blue-700 bg-blue-50/40 text-blue-900 shadow-3xs font-bold scale-[1.01]'
                    : 'border-slate-200 hover:border-slate-350 bg-white text-slate-650 shadow-3xs'
                }`}
              >
                <div className="flex items-center justify-between gap-2 mb-1 font-sans">
                  <span className="block text-xs font-bold uppercase tracking-tight">
                    Enkelzijdig bedrukt (4/0)
                  </span>
                  <div className={`w-4 h-4 rounded-full border flex items-center justify-center shrink-0 ${printSides === 'single' ? 'border-blue-600 bg-blue-600 text-white' : 'border-slate-350'}`}>
                    {printSides === 'single' && <span className="text-[9px] font-bold text-white">✓</span>}
                  </div>
                </div>
                <span className="block text-[11px] text-slate-500 leading-snug font-medium font-sans">
                  Alleen voorzijde bedrukt. Perfect voor posters, stickers of eenzijdige flyers.
                </span>
              </button>

              <button
                type="button"
                disabled={selectedCategory === 'Sticker'}
                onClick={() => onChangePrintSides('double')}
                className={`p-4 rounded-xl border-2 text-left transition-all ${
                  selectedCategory === 'Sticker'
                    ? 'border-slate-100 bg-slate-100/50 text-slate-400 cursor-not-allowed opacity-50'
                    : printSides === 'double'
                    ? 'border-blue-700 bg-blue-50/40 text-blue-900 shadow-3xs font-bold scale-[1.01] cursor-pointer'
                    : 'border-slate-200 hover:border-slate-350 bg-white text-slate-650 shadow-3xs cursor-pointer'
                }`}
              >
                <div className="flex items-center justify-between gap-2 mb-1 font-sans">
                  <span className="block text-xs font-bold uppercase tracking-tight">
                    Dubbelzijdig bedrukt (4/4)
                  </span>
                  <div className={`w-4 h-4 rounded-full border flex items-center justify-center shrink-0 ${
                    selectedCategory === 'Sticker'
                      ? 'border-slate-200 bg-slate-150'
                      : printSides === 'double'
                      ? 'border-blue-600 bg-blue-600 text-white'
                      : 'border-slate-350'
                  }`}>
                    {printSides === 'double' && selectedCategory !== 'Sticker' && <span className="text-[9px] font-bold text-white">✓</span>}
                  </div>
                </div>
                <span className="block text-[11px] text-slate-500 leading-snug font-medium font-sans font-sans">
                  {selectedCategory === 'Sticker'
                    ? 'Stickers kunnen niet dubbelzijdig bedrukt worden.'
                    : 'Zowel voor- als achterzijde bedrukt. Ideaal voor folders en visitekaarten.'}
                </span>
              </button>
            </div>
          )}
        </div>
      </div>

      {/* BIG CONFIRM BUTTON to transition to Step 3 (Upload) */}
      <div className="pt-4 flex justify-end">
        <button
          type="button"
          onClick={onNextStep}
          className="w-full sm:w-auto bg-brand-red hover:bg-brand-red-dark text-white font-extrabold text-sm py-4 px-8 rounded-2xl shadow-md hover:shadow-lg transition-all flex items-center justify-center gap-2.5 cursor-pointer border-none font-sans"
        >
          <span>Formaat bevestigen & Bestanden Uploaden</span>
          <ArrowRight className="w-4 h-4" />
        </button>
      </div>

    </div>
  );
}

// Keep a default export wrapper so code compiles without imports changing, but also export named parts
export default function ProductSelectorWrapper(props: any) {
  const [selectedCategory, setSelectedCategory] = React.useState<string | null>(props.selectedProduct?.category || null);
  
  const handleCategorySelect = (categoryId: string) => {
    setSelectedCategory(categoryId);
    const categoryProducts = props.products.filter((p: any) => p.category === categoryId);
    if (categoryProducts.length > 0) {
      props.onSelectProduct(categoryProducts[0]);
    }
  };

  if (!selectedCategory) {
    return (
      <ProductCategorySelector 
        onSelectCategory={handleCategorySelect} 
        selectedCategory={selectedCategory} 
      />
    );
  }

  return (
    <ProductFormatSelector 
      {...props} 
      onPrevStep={() => setSelectedCategory(null)} 
    />
  );
}

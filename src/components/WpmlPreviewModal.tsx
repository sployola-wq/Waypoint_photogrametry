import React, { useState } from 'react';
import { FileCode, Copy, Check, X, Download, CheckCircle2 } from 'lucide-react';
import { MissionData } from '../types/mission';
import {
  generateTemplateKml,
  generateWaylinesWpml,
  triggerFileDownload,
} from '../utils/wpmlGenerator';

interface WpmlPreviewModalProps {
  mission: MissionData;
  isOpen: boolean;
  onClose: () => void;
}

export const WpmlPreviewModal: React.FC<WpmlPreviewModalProps> = ({
  mission,
  isOpen,
  onClose,
}) => {
  const [activeTab, setActiveTab] = useState<'template' | 'waylines'>('template');
  const [copied, setCopied] = useState(false);

  if (!isOpen) return null;

  const templateKml = generateTemplateKml(mission);
  const waylinesWpml = generateWaylinesWpml(mission);
  const activeContent = activeTab === 'template' ? templateKml : waylinesWpml;

  const handleCopy = () => {
    navigator.clipboard.writeText(activeContent);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleDownloadActiveFile = () => {
    const filename = activeTab === 'template' ? 'template.kml' : 'waylines.wpml';
    const blob = new Blob([activeContent], { type: 'application/xml;charset=utf-8;' });
    triggerFileDownload(blob, filename);
  };

  return (
    <div
      id="wpml-preview-modal"
      className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4 select-none animate-in fade-in"
    >
      <div className="bg-[#15181E] border border-[#2D333F] rounded w-full max-w-4xl max-h-[85vh] flex flex-col shadow-2xl overflow-hidden font-sans">
        {/* Modal Header */}
        <div className="p-3.5 border-b border-[#2D333F] flex items-center justify-between bg-[#15181E] shrink-0">
          <div className="flex items-center gap-2.5">
            <div className="w-7 h-7 rounded bg-[#1C1F26] text-[#00E676] border border-[#2D333F] flex items-center justify-center">
              <FileCode className="w-3.5 h-3.5" />
            </div>
            <div>
              <h3 className="text-xs font-bold text-white uppercase tracking-wider font-mono">
                Inspector DJI Waypoint 3.0 (WPML 1.0.2)
              </h3>
              <p className="text-[11px] text-[#717885]">
                Estructura XML escapada y validada para DJI Fly (Air 3S / Mini 4 Pro) y DJI Pilot 2
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="p-1 rounded text-[#717885] hover:text-white hover:bg-[#1C1F26] transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Tab Switcher & Actions */}
        <div className="px-3.5 py-2 border-b border-[#2D333F] bg-[#0F1115] flex items-center justify-between gap-2 shrink-0 font-mono">
          {/* Tabs */}
          <div className="flex items-center gap-1.5">
            <button
              type="button"
              onClick={() => setActiveTab('template')}
              className={`px-2.5 py-1 rounded text-xs font-mono transition-all flex items-center gap-1.5 ${
                activeTab === 'template'
                  ? 'bg-[#00E676] text-black font-bold'
                  : 'bg-[#1C1F26] text-[#717885] hover:text-white border border-[#2D333F]'
              }`}
            >
              <span>wpmz/template.kml</span>
            </button>

            <button
              type="button"
              onClick={() => setActiveTab('waylines')}
              className={`px-2.5 py-1 rounded text-xs font-mono transition-all flex items-center gap-1.5 ${
                activeTab === 'waylines'
                  ? 'bg-[#00E676] text-black font-bold'
                  : 'bg-[#1C1F26] text-[#717885] hover:text-white border border-[#2D333F]'
              }`}
            >
              <span>wpmz/waylines.wpml</span>
            </button>
          </div>

          {/* Actions */}
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handleCopy}
              className="px-2.5 py-1 rounded bg-[#1C1F26] hover:bg-[#252A34] text-[#E0E0E0] text-xs font-mono flex items-center gap-1.5 border border-[#2D333F] transition-colors"
            >
              {copied ? (
                <>
                  <Check className="w-3 h-3 text-[#00E676]" />
                  <span className="text-[#00E676]">Copiado</span>
                </>
              ) : (
                <>
                  <Copy className="w-3 h-3 text-[#717885]" />
                  <span>Copiar XML</span>
                </>
              )}
            </button>

            <button
              type="button"
              onClick={handleDownloadActiveFile}
              className="px-2.5 py-1 rounded bg-[#1C1F26] hover:bg-[#252A34] text-[#E0E0E0] text-xs font-mono flex items-center gap-1.5 border border-[#2D333F] transition-colors"
            >
              <Download className="w-3 h-3 text-[#00E676]" />
              <span>Descargar</span>
            </button>
          </div>
        </div>

        {/* Code Content (React text node automatically escapes any HTML/XSS) */}
        <div className="flex-1 overflow-y-auto p-3.5 bg-[#0B0D11] font-mono text-[11px] text-[#E0E0E0] custom-scrollbar select-text leading-relaxed">
          <pre className="whitespace-pre overflow-x-auto text-[#00E676]/90">{activeContent}</pre>
        </div>

        {/* Modal Footer */}
        <div className="p-2.5 border-t border-[#2D333F] bg-[#15181E] flex items-center justify-between text-xs text-[#717885] shrink-0 font-mono">
          <div className="flex items-center gap-2">
            <CheckCircle2 className="w-3.5 h-3.5 text-[#00E676]" />
            <span className="text-[11px]">
              Esquema DJI WPML 3.0 validado para DJI Air 3S (RC 2 / RC-N2), Mini 4 Pro, Mavic 3E y Matrice 350
            </span>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="px-3 py-1 rounded bg-[#1C1F26] hover:bg-[#252A34] text-[#E0E0E0] border border-[#2D333F]"
          >
            Cerrar
          </button>
        </div>
      </div>
    </div>
  );
};

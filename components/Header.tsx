import React from 'react';

const Header: React.FC = () => {
    return (
        <header className="bg-white border-b border-slate-200 sticky top-0 z-30 shadow-sm backdrop-blur-sm bg-white/95">
            <div className="max-w-[1920px] mx-auto px-4 lg:px-6 h-16 flex items-center justify-between">
                <div className="flex items-center gap-3">
                    <div className="h-9 w-9 bg-brand-600 rounded-lg flex items-center justify-center text-white shadow-md shadow-brand-500/30">
                        <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                            <polyline points="22 12 18 12 15 21 9 3 6 12 2 12"></polyline>
                        </svg>
                    </div>
                    <div>
                        <h1 className="text-xl font-bold text-slate-800 tracking-tight leading-none">
                            Spectra<span className="text-brand-600">Pro</span>
                        </h1>
                        <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-widest leading-none mt-1">
                            Scientific Analysis
                        </p>
                    </div>
                </div>
                
                <div className="flex items-center gap-4">
                    <span className="hidden md:inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold bg-slate-100 text-slate-600 border border-slate-200">
                        v2.3 Lab
                    </span>
                    <div className="h-9 w-9 rounded-full bg-slate-50 border border-slate-200 flex items-center justify-center text-slate-400 hover:text-brand-600 hover:bg-white hover:shadow-md cursor-pointer transition-all" title="Perfil de Usuario">
                        <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"></path>
                            <circle cx="12" cy="7" r="4"></circle>
                        </svg>
                    </div>
                </div>
            </div>
        </header>
    );
};

export default Header;
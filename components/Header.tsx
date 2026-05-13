import React from 'react';

const Header: React.FC = () => {
    return (
        <header className="bg-ui-card border-b border-ui-border sticky top-0 z-30 shadow-sm">
            <div className="mx-auto px-4 lg:px-6 h-16 flex items-center justify-between">
                <div className="flex items-center gap-3">
                    <div className="h-9 w-9 rounded-lg border border-ui-accent/30 flex items-center justify-center text-ui-accent">
                        <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <polyline points="22 12 18 12 15 21 9 3 6 12 2 12"></polyline>
                        </svg>
                    </div>
                    <div>
                        <h1 className="text-xl font-bold text-white tracking-tight leading-none">
                            Spectra<span className="text-ui-accent">Pro</span>
                        </h1>
                        <p className="text-[10px] font-semibold text-ui-accent uppercase tracking-widest leading-none mt-1">
                            RSS
                        </p>
                    </div>
                </div>
                
                <div className="flex items-center gap-4">
                    <div className="h-9 w-9 rounded-full bg-ui-darkest border border-ui-border flex items-center justify-center text-slate-400 hover:text-ui-accent hover:border-ui-accent cursor-pointer transition-all" title="Perfil de Usuario">
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
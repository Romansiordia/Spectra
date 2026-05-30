import React from 'react';

const Header: React.FC = () => {
    return (
        <header className="bg-ui-card border-b border-ui-border sticky top-0 z-30 shadow-sm w-full">
            <div className="w-full px-4 lg:px-6 h-20 flex items-center justify-between">
                <div className="flex items-center gap-3">
                    <div className="h-14 w-auto flex items-center justify-center">
                        <img src="/logo.png" alt="SpectraModel" className="h-full w-auto object-contain" />
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
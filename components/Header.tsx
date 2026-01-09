
import React from 'react';

const Header: React.FC = () => {
    return (
        <header className="bg-white shadow-sm p-4 flex items-center gap-4 border-b border-gray-200">
            <div className="h-10 w-10 flex-shrink-0">
                <svg viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg" className="w-full h-full">
                    <defs>
                        <linearGradient id="logoGradientHeader" x1="0%" y1="0%" x2="100%" y2="0%">
                            <stop offset="0%" stopColor="#EF4444" />
                            <stop offset="25%" stopColor="#F59E0B" />
                            <stop offset="50%" stopColor="#10B981" />
                            <stop offset="75%" stopColor="#3B82F6" />
                            <stop offset="100%" stopColor="#8B5CF6" />
                        </linearGradient>
                    </defs>
                    <path d="M10 60 Q 30 20, 50 60 T 90 60" stroke="url(#logoGradientHeader)" strokeWidth="12" fill="none" strokeLinecap="round"/>
                    <path d="M10 60 Q 30 100, 50 60 T 90 60" stroke="url(#logoGradientHeader)" strokeWidth="12" fill="none" strokeLinecap="round" opacity="0.6"/>
                </svg>
            </div>
            <h1 className="text-2xl font-bold text-gray-900">
                Spectra <span className="text-brand-primary font-normal text-xl">- Plataforma Quimiométrica NIR</span>
            </h1>
        </header>
    );
};

export default Header;

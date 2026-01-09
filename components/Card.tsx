import React from 'react';

interface CardProps {
    children: React.ReactNode;
    className?: string;
    noPadding?: boolean;
}

const Card: React.FC<CardProps> = ({ children, className = '', noPadding = false }) => {
    return (
        <div className={`bg-white rounded-xl border border-slate-200 shadow-card overflow-hidden flex flex-col ${className}`}>
            <div className={`flex-1 ${noPadding ? '' : 'p-6'}`}>
                {children}
            </div>
        </div>
    );
};

export default Card;
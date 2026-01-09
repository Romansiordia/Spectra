import React from 'react';

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
    variant?: 'primary' | 'secondary' | 'danger' | 'ghost';
    size?: 'sm' | 'md' | 'lg';
    children: React.ReactNode;
}

const Button: React.FC<ButtonProps> = ({ variant = 'primary', size = 'md', children, className = '', ...props }) => {
    
    const baseClasses = 'inline-flex items-center justify-center gap-2 rounded-lg font-semibold transition-all duration-200 ease-in-out disabled:opacity-50 disabled:cursor-not-allowed select-none focus:outline-none focus:ring-2 focus:ring-offset-1 focus:ring-offset-white';
    
    const sizeClasses = {
        sm: 'px-3 py-1.5 text-xs',
        md: 'px-4 py-2 text-sm',
        lg: 'px-6 py-3 text-base',
    };

    const variantClasses = {
        primary: 'bg-brand-600 text-white hover:bg-brand-700 shadow-md shadow-brand-500/20 border border-transparent focus:ring-brand-500',
        secondary: 'bg-white text-slate-700 hover:bg-slate-50 border border-slate-300 shadow-sm hover:border-slate-400 focus:ring-slate-400',
        danger: 'bg-white text-red-600 hover:bg-red-50 border border-red-200 shadow-sm hover:border-red-300 focus:ring-red-400',
        ghost: 'bg-transparent text-slate-500 hover:text-brand-600 hover:bg-slate-50 border border-transparent',
    };

    return (
        <button className={`${baseClasses} ${sizeClasses[size]} ${variantClasses[variant]} ${className}`} {...props}>
            {children}
        </button>
    );
};

export default Button;
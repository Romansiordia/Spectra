import React from 'react';

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
    variant?: 'primary' | 'secondary' | 'danger' | 'ghost' | 'success';
    size?: 'sm' | 'md' | 'lg';
    children: React.ReactNode;
}

const Button: React.FC<ButtonProps> = ({ variant = 'primary', size = 'md', children, className = '', ...props }) => {
    
    const sizeClasses = {
        sm: 'px-3 py-1.5 text-xs',
        md: 'px-4 py-2 text-sm',
        lg: 'px-6 py-3 text-base',
    };

    const variantClasses = {
        primary: 'bg-transparent text-ui-accent hover:bg-ui-accent hover:text-[#0a1d4a] shadow-[0_0_15px_rgba(14,165,233,0.2)] border border-ui-accent focus:ring-ui-accent',
        secondary: 'bg-ui-card text-slate-200 hover:bg-ui-darkest border border-ui-border shadow-sm hover:border-ui-accent focus:ring-ui-accent',
        danger: 'bg-transparent text-red-400 hover:bg-red-500 hover:text-white border border-red-500/30 hover:border-red-500 shadow-[0_0_15px_rgba(239,68,68,0.1)] focus:ring-red-400',
        ghost: 'bg-transparent text-slate-400 hover:text-ui-accent hover:bg-ui-darkest border border-transparent',
        success: 'bg-transparent text-ui-success hover:bg-ui-success hover:text-[#0a1d4a] shadow-[0_0_15px_rgba(34,197,94,0.2)] border border-ui-success focus:ring-ui-success',
    };

    // Override the focus offset ring to dark mode
    const baseClasses = 'inline-flex items-center justify-center gap-2 rounded-lg font-semibold transition-all duration-200 ease-in-out disabled:opacity-50 disabled:cursor-not-allowed select-none focus:outline-none focus:ring-2 focus:ring-offset-1 focus:ring-offset-ui-darkest';

    return (
        <button className={`${baseClasses} ${sizeClasses[size]} ${variantClasses[variant]} ${className}`} {...props}>
            {children}
        </button>
    );
};

export default Button;
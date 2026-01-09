
import React from 'react';

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
    variant?: 'primary' | 'secondary';
    children: React.ReactNode;
}

const Button: React.FC<ButtonProps> = ({ variant = 'primary', children, className = '', ...props }) => {
    const baseClasses = 'inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg font-semibold transition-all duration-200 ease-in-out disabled:opacity-50 disabled:cursor-not-allowed select-none';
    
    const variantClasses = {
        primary: 'bg-brand-primary text-white hover:bg-blue-700',
        secondary: 'bg-gray-200 text-gray-800 hover:bg-gray-300 border border-gray-300',
    };

    return (
        <button className={`${baseClasses} ${variantClasses[variant]} ${className}`} {...props}>
            {children}
        </button>
    );
};

export default Button;

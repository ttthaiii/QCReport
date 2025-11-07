// AutocompleteInput.tsx - FINAL VERSION with Portal

import React, { useState, useRef, useEffect } from 'react';
import { createPortal } from 'react-dom';
import styles from './AutocompleteInput.module.css';

interface AutocompleteInputProps {
  value: string;
  onChange: (value: string) => void;
  suggestions: string[];
  placeholder?: string;
  className?: string;
}

const AutocompleteInput: React.FC<AutocompleteInputProps> = ({
  value,
  onChange,
  suggestions,
  placeholder,
  className
}) => {
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [filteredSuggestions, setFilteredSuggestions] = useState<string[]>([]);
  const [dropdownPosition, setDropdownPosition] = useState({ top: 0, left: 0, width: 0 });
  
  const wrapperRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Filter suggestions
  useEffect(() => {
    if (value.trim()) {
      const filtered = suggestions.filter(s => 
        s.toLowerCase().includes(value.toLowerCase())
      );
      setFilteredSuggestions(filtered);
    } else {
      setFilteredSuggestions(suggestions);
    }
  }, [value, suggestions]);

  // คำนวณตำแหน่ง dropdown
  const updateDropdownPosition = () => {
    if (inputRef.current) {
      const rect = inputRef.current.getBoundingClientRect();
      setDropdownPosition({
        top: rect.bottom + window.scrollY + 2,
        left: rect.left + window.scrollX,
        width: rect.width
      });
    }
  };

  // อัปเดตตำแหน่งเมื่อเปิด dropdown หรือ scroll/resize
  useEffect(() => {
    if (showSuggestions) {
      updateDropdownPosition();
      
      const handleUpdate = () => {
        if (showSuggestions) {
          updateDropdownPosition();
        }
      };
      
      window.addEventListener('scroll', handleUpdate, true);
      window.addEventListener('resize', handleUpdate);
      
      return () => {
        window.removeEventListener('scroll', handleUpdate, true);
        window.removeEventListener('resize', handleUpdate);
      };
    }
  }, [showSuggestions]);

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (wrapperRef.current && !wrapperRef.current.contains(event.target as Node)) {
        // เช็คว่าคลิกที่ dropdown หรือไม่
        const target = event.target as HTMLElement;
        if (!target.closest(`.${styles.suggestionsList}`)) {
          setShowSuggestions(false);
        }
      }
    };

    if (showSuggestions) {
      document.addEventListener('mousedown', handleClickOutside);
      return () => document.removeEventListener('mousedown', handleClickOutside);
    }
  }, [showSuggestions]);

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    onChange(e.target.value);
    setShowSuggestions(true);
  };

  const handleSuggestionClick = (suggestion: string) => {
    onChange(suggestion);
    setShowSuggestions(false);
  };

  const handleInputFocus = () => {
    setShowSuggestions(true);
    updateDropdownPosition();
  };

  // Render dropdown using Portal
  const renderDropdown = () => {
    if (!showSuggestions) return null;

    const dropdown = (
      <ul 
        className={styles.suggestionsList}
        style={{
          position: 'fixed',
          top: `${dropdownPosition.top}px`,
          left: `${dropdownPosition.left}px`,
          width: `${dropdownPosition.width}px`,
        }}
      >
        {filteredSuggestions.length > 0 ? (
          filteredSuggestions.map((suggestion, index) => (
            <li
              key={index}
              onClick={() => handleSuggestionClick(suggestion)}
              className={styles.suggestionItem}
            >
              {suggestion}
            </li>
          ))
        ) : (
          <li className={styles.noSuggestions}>
            ยังไม่มีข้อมูล
          </li>
        )}
      </ul>
    );

    return createPortal(dropdown, document.body);
  };

  return (
    <div ref={wrapperRef} className={styles.autocompleteWrapper}>
      <input
        ref={inputRef}
        type="text"
        value={value}
        onChange={handleInputChange}
        onFocus={handleInputFocus}
        placeholder={placeholder}
        className={className || styles.autocompleteInput}
      />
      {renderDropdown()}
    </div>
  );
};

export default AutocompleteInput;
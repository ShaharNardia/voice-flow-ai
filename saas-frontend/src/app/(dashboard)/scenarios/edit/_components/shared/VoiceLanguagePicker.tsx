"use client";

import React from "react";
import FieldWrapper, { SelectInput } from "./FieldWrapper";
import { LANGUAGES, getVoicesForLanguage } from "../../_lib/voices";

interface VoiceLanguagePickerProps {
  language: string;
  voice: string;
  onLanguageChange: (lang: string) => void;
  onVoiceChange: (voice: string) => void;
}

export default function VoiceLanguagePicker({
  language,
  voice,
  onLanguageChange,
  onVoiceChange,
}: VoiceLanguagePickerProps) {
  const voices = getVoicesForLanguage(language);

  const handleLanguageChange = (lang: string) => {
    onLanguageChange(lang);
    // Auto-select first voice for new language
    const newVoices = getVoicesForLanguage(lang);
    if (newVoices.length > 0 && !newVoices.find((v) => v.value === voice)) {
      onVoiceChange(newVoices[0].value);
    }
  };

  return (
    <>
      <FieldWrapper label="Language">
        <SelectInput
          value={language}
          onChange={handleLanguageChange}
          options={LANGUAGES.map((l) => ({ value: l.value, label: l.label }))}
        />
      </FieldWrapper>
      <FieldWrapper label="Voice">
        <SelectInput
          value={voice}
          onChange={onVoiceChange}
          options={voices}
        />
      </FieldWrapper>
    </>
  );
}

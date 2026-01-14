import React, { useEffect, useState, useMemo } from 'react';
import {
  Autocomplete,
  TextField,
  CircularProgress,
  Box,
  Typography,
} from '@mui/material';

interface SearchAutocompleteProps<T> {
  label?: string;
  placeholder?: string;
  minChars?: number;
  fetchOptions: (query: string) => Promise<T[]>;
  getOptionLabel: (option: T) => string;
  onSelect: (option: T | null) => void;
  disabled?: boolean;
  value?: T | null;
  renderOptionExtra?: (option: T) => React.ReactNode;
  isOptionEqualToValue?: (option: T, value: T) => boolean;
}

/** Generic debounced search autocomplete replicating root MUI behavior */
export function SearchAutocomplete<T>(props: SearchAutocompleteProps<T>) {
  const {
    label = 'Search',
    placeholder,
    minChars = 3,
    fetchOptions,
    getOptionLabel,
    onSelect,
    disabled,
    value = null,
    renderOptionExtra,
    isOptionEqualToValue,
  } = props;

  const [inputValue, setInputValue] = useState('');
  const [options, setOptions] = useState<T[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Sync input value with selected value
  useEffect(() => {
    if (value) {
      setInputValue(getOptionLabel(value));
    }
  }, [value, getOptionLabel]);

  // Debounced query
  useEffect(() => {
    if (disabled) return;
    if (inputValue.trim().length < minChars) {
      setOptions([]);
      return;
    }
    let active = true;
    const handle = setTimeout(async () => {
      setLoading(true);
      setError(null);
      try {
        const data = await fetchOptions(inputValue.trim());
        if (active) setOptions(data);
      } catch (e: any) {
        console.error('Autocomplete fetch error', e);
        if (active) {
          setError(e?.message || 'Failed to fetch results');
          setOptions([]);
        }
      } finally {
        active && setLoading(false);
      }
    }, 500);
    return () => {
      active = false;
      clearTimeout(handle);
    };
  }, [inputValue, minChars, fetchOptions, disabled]);

  // Provide stable option label
  const getLabel = useMemo(() => getOptionLabel, [getOptionLabel]);

  const handleChange = (_: any, newVal: T | null) => {
    if (newVal) {
      setInputValue(getLabel(newVal));
    }
    onSelect(newVal);
  };

  return (
    <Autocomplete
      fullWidth
      options={options}
      loading={loading}
      value={value}
      inputValue={inputValue}
      onInputChange={(_, v) => setInputValue(v)}
      onChange={handleChange}
      getOptionLabel={(o) => (o ? getLabel(o as T) : '')}
      filterOptions={(x) => x}
      disabled={disabled}
      isOptionEqualToValue={isOptionEqualToValue}
      noOptionsText={
        inputValue.length < minChars
          ? `Type at least ${minChars} characters`
          : error
            ? error
            : 'No results'
      }
      renderInput={(params) => (
        <TextField
          {...params}
          label={label}
          placeholder={placeholder}
          InputProps={{
            ...params.InputProps,
            endAdornment: (
              <>
                {loading && <CircularProgress size={20} />}
                {params.InputProps.endAdornment}
              </>
            ),
          }}
        />
      )}
      renderOption={(liProps, option) => {
        const { key, ...rest } = liProps as any;
        return (
          <Box
            component="li"
            key={key}
            {...rest}
            sx={{ display: 'flex', flexDirection: 'column' }}
          >
            <Typography variant="body2">{getLabel(option as T)}</Typography>
            {renderOptionExtra && (
              <Typography
                variant="caption"
                color="text.secondary"
                sx={{ mt: 0.5 }}
              >
                {renderOptionExtra(option as T)}
              </Typography>
            )}
          </Box>
        );
      }}
    />
  );
}

export default SearchAutocomplete;

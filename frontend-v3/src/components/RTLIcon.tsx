import { Box, SxProps, Theme } from '@mui/material';
import { useLanguage } from '../context/LanguageContext';

interface RTLIconProps {
  children: React.ReactNode;
  sx?: SxProps<Theme>;
  flip?: boolean; // Optional: force flip or not flip
}

/**
 * Wrapper component that flips icons in RTL mode
 * Usage: <RTLIcon><ArrowForward /></RTLIcon>
 */
export default function RTLIcon({ children, sx, flip = true }: RTLIconProps) {
  const { isRTL } = useLanguage();

  return (
    <Box
      component="span"
      sx={{
        display: 'inline-flex',
        transform: isRTL && flip ? 'scaleX(-1)' : 'none',
        ...sx,
      }}
    >
      {children}
    </Box>
  );
}

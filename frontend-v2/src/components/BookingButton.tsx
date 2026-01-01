import { Button, Chip, Stack, Tooltip } from '@mui/material';
import { OpenInNew, AttachMoney } from '@mui/icons-material';

interface BookingButtonProps {
  bookingLink?: string;
  price?: number;
  currency?: string;
  type: 'hotel' | 'flight';
  affiliate?: boolean;
  variant?: 'button' | 'chip' | 'inline';
  size?: 'small' | 'medium' | 'large';
}

/**
 * BookingButton Component
 *
 * Displays a "Book Now" button with affiliate tracking
 * Shows price and opens booking link in new tab
 *
 * @example
 * <BookingButton
 *   bookingLink="https://..."
 *   price={299}
 *   currency="USD"
 *   type="hotel"
 *   affiliate={true}
 * />
 */
export default function BookingButton({
  bookingLink,
  price,
  currency = 'USD',
  type,
  affiliate = false,
  variant = 'button',
  size = 'medium',
}: BookingButtonProps) {
  if (!bookingLink) {
    return null; // Don't show button if no link
  }

  const handleBookNow = () => {
    // Track click (optional - can add analytics here)
    console.log(`🎯 Affiliate Click: ${type} - ${bookingLink}`);

    // Open in new tab
    window.open(bookingLink, '_blank', 'noopener,noreferrer');
  };

  const formatPrice = (amount: number) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: currency,
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(amount);
  };

  // Button variant (default)
  if (variant === 'button') {
    return (
      <Tooltip
        title={affiliate ? 'Earn commission when user books!' : 'Book now'}
      >
        <Button
          variant="contained"
          color="primary"
          size={size}
          onClick={handleBookNow}
          startIcon={<OpenInNew />}
          endIcon={affiliate ? <AttachMoney sx={{ color: '#4CAF50' }} /> : null}
          sx={{
            background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
            '&:hover': {
              background: 'linear-gradient(135deg, #764ba2 0%, #667eea 100%)',
            },
            fontWeight: 600,
            textTransform: 'none',
          }}
        >
          {price ? `Book ${formatPrice(price)}` : 'Book Now'}
        </Button>
      </Tooltip>
    );
  }

  // Chip variant (compact)
  if (variant === 'chip') {
    return (
      <Tooltip title={affiliate ? 'Earn commission! 💰' : 'Book now'}>
        <Chip
          label={price ? formatPrice(price) : 'Book'}
          onClick={handleBookNow}
          icon={<OpenInNew />}
          color="primary"
          sx={{
            cursor: 'pointer',
            fontWeight: 600,
            background: affiliate
              ? 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)'
              : undefined,
            '&:hover': {
              opacity: 0.8,
            },
          }}
        />
      </Tooltip>
    );
  }

  // Inline variant (text with price)
  if (variant === 'inline') {
    return (
      <Stack direction="row" spacing={1} alignItems="center">
        {price && (
          <Chip
            label={formatPrice(price)}
            size="small"
            color="success"
            variant="outlined"
          />
        )}
        <Button
          size="small"
          onClick={handleBookNow}
          endIcon={<OpenInNew fontSize="small" />}
          sx={{
            textTransform: 'none',
            fontWeight: 600,
          }}
        >
          Book Now
        </Button>
        {affiliate && (
          <Tooltip title="You earn commission from this booking!">
            <AttachMoney sx={{ color: '#4CAF50', fontSize: 18 }} />
          </Tooltip>
        )}
      </Stack>
    );
  }

  return null;
}

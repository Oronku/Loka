import { useState } from 'react';
import {
  Box,
  Button,
  CircularProgress,
  Alert,
  Typography,
  Paper,
} from '@mui/material';
import { CloudUpload as UploadIcon } from '@mui/icons-material';
import {
  extractTripDataFromPDF,
  validateExtractionResult,
} from '../services/pdfExtraction';

interface PDFUploadButtonProps {
  onDataExtracted: (data: any) => void;
  acceptedType?: 'flight' | 'hotel' | 'both';
  disabled?: boolean;
}

export default function PDFUploadButton({
  onDataExtracted,
  acceptedType = 'both',
  disabled = false,
}: PDFUploadButtonProps) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  const handleFileUpload = async (
    event: React.ChangeEvent<HTMLInputElement>
  ) => {
    const file = event.target.files?.[0];
    if (!file) return;

    // Validate file type
    if (file.type !== 'application/pdf') {
      setError('Please upload a PDF file');
      return;
    }

    // Validate file size (max 10MB)
    if (file.size > 10 * 1024 * 1024) {
      setError('File size must be less than 10MB');
      return;
    }

    setLoading(true);
    setError('');
    setSuccess('');

    try {
      const extractedData = await extractTripDataFromPDF(file);

      if (!extractedData) {
        setError(
          'Could not extract data from PDF. Please enter details manually.'
        );
        setLoading(false);
        return;
      }

      // Validate extracted data
      if (!validateExtractionResult(extractedData)) {
        setError(
          'Extracted data is incomplete. Please verify and fill missing fields.'
        );
        setLoading(false);
        return;
      }

      // Check if extracted type matches accepted type
      if (acceptedType !== 'both' && extractedData.type !== acceptedType) {
        setError(
          `This appears to be a ${extractedData.type} document, but expected ${acceptedType}`
        );
        setLoading(false);
        return;
      }

      setSuccess(
        `Successfully extracted ${extractedData.type} information! Review and edit if needed.`
      );
      onDataExtracted(extractedData);
      setLoading(false);

      // Clear success message after 5 seconds
      setTimeout(() => setSuccess(''), 5000);
    } catch (err: any) {
      console.error('PDF upload error:', err);
      setError(
        err.message || 'Failed to process PDF. Please enter details manually.'
      );
      setLoading(false);
    }

    // Reset file input
    event.target.value = '';
  };

  return (
    <Box>
      <input
        accept="application/pdf"
        style={{ display: 'none' }}
        id="pdf-upload-input"
        type="file"
        onChange={handleFileUpload}
        disabled={disabled || loading}
      />
      <label htmlFor="pdf-upload-input">
        <Button
          variant="outlined"
          component="span"
          startIcon={loading ? <CircularProgress size={20} /> : <UploadIcon />}
          disabled={disabled || loading}
          fullWidth
        >
          {loading ? 'Processing PDF...' : 'Upload PDF'}
        </Button>
      </label>

      {error && (
        <Alert severity="error" onClose={() => setError('')} sx={{ mt: 2 }}>
          {error}
        </Alert>
      )}

      {success && (
        <Alert severity="success" sx={{ mt: 2 }}>
          {success}
        </Alert>
      )}

      {loading && (
        <Paper sx={{ mt: 2, p: 2, bgcolor: 'info.light' }}>
          <Typography variant="body2" color="text.secondary">
            🔍 Analyzing PDF document...
          </Typography>
          <Typography variant="caption" color="text.secondary">
            This may take a few seconds
          </Typography>
        </Paper>
      )}
    </Box>
  );
}

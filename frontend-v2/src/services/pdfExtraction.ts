import * as pdfjsLib from 'pdfjs-dist';

// Configure PDF.js worker - use unpkg CDN
pdfjsLib.GlobalWorkerOptions.workerSrc = `https://unpkg.com/pdfjs-dist@${pdfjsLib.version}/build/pdf.worker.min.mjs`;

interface FlightExtractionResult {
  type: 'flight';
  airline: string;
  flightNumber: string;
  departureAirportCode: string;
  arrivalAirportCode: string;
  departureDateTime: string;
  arrivalDateTime: string;
  bookingNumber?: string;
  passengerName?: string;
  confidence: number;
}

interface HotelExtractionResult {
  type: 'hotel';
  name: string;
  address?: string;
  checkIn: string;
  checkOut: string;
  guestName?: string;
  numberOfRooms?: number;
  confirmationNumber?: string;
  confidence: number;
}

type ExtractionResult = FlightExtractionResult | HotelExtractionResult | null;

/**
 * Extract text from PDF file using PDF.js
 */
async function extractTextFromPDF(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = async (e) => {
      try {
        const arrayBuffer = e.target?.result as ArrayBuffer;
        const pdf = await pdfjsLib.getDocument({
          data: arrayBuffer,
          useWorkerFetch: false,
          isEvalSupported: false,
          useSystemFonts: true,
        }).promise;

        let fullText = '';

        // Extract text from all pages
        for (let pageNum = 1; pageNum <= pdf.numPages; pageNum++) {
          const page = await pdf.getPage(pageNum);
          const textContent = await page.getTextContent();
          const pageText = textContent.items
            .map((item: any) => item.str)
            .join(' ');
          fullText += pageText + '\n';
        }

        resolve(fullText);
      } catch (error) {
        console.error('PDF extraction error:', error);
        reject(new Error('Failed to extract text from PDF'));
      }
    };
    reader.onerror = () => reject(new Error('Failed to read PDF file'));
    reader.readAsArrayBuffer(file);
  });
}

/**
 * Parse flight ticket using pattern matching
 */
function parseFlightTicket(text: string): FlightExtractionResult | null {
  // Common patterns in flight tickets
  const patterns = {
    // Flight number: AA123, UA 456, etc.
    flightNumber: /(?:flight|flt)[\s:]*([A-Z]{2}\d{1,4})/i,

    // Airport codes: JFK, LAX, etc.
    airportCodes: /\b([A-Z]{3})\b/g,

    // Dates: various formats
    date: /(\d{1,2}[-/]\d{1,2}[-/]\d{2,4}|\d{4}[-/]\d{2}[-/]\d{2})/g,

    // Time: 14:30, 2:30 PM, etc.
    time: /(\d{1,2}:\d{2}\s?(?:AM|PM)?)/gi,

    // Booking reference: 6-character alphanumeric
    bookingRef: /(?:booking|confirmation|pnr)[\s:]*([A-Z0-9]{6})/i,

    // Passenger name
    passenger: /(?:passenger|name)[\s:]*([A-Z\s]+)/i,
  };

  try {
    const flightMatch = text.match(patterns.flightNumber);
    const airportMatches = text.match(patterns.airportCodes);
    const dateMatches = text.match(patterns.date);
    const timeMatches = text.match(patterns.time);

    if (!flightMatch || !airportMatches || airportMatches.length < 2) {
      return null;
    }

    const flightNumber = flightMatch[1];
    const airline = flightNumber.substring(0, 2);

    // First airport code is usually departure
    const departureAirportCode = airportMatches[0];
    const arrivalAirportCode = airportMatches[1];

    // Combine date and time if available
    let departureDateTime = '';
    let arrivalDateTime = '';

    if (dateMatches && dateMatches.length > 0) {
      departureDateTime = dateMatches[0];
      if (timeMatches && timeMatches.length > 0) {
        departureDateTime += ` ${timeMatches[0]}`;
      }

      if (dateMatches.length > 1) {
        arrivalDateTime = dateMatches[1];
        if (timeMatches && timeMatches.length > 1) {
          arrivalDateTime += ` ${timeMatches[1]}`;
        }
      }
    }

    return {
      type: 'flight',
      airline,
      flightNumber,
      departureAirportCode,
      arrivalAirportCode,
      departureDateTime,
      arrivalDateTime: arrivalDateTime || departureDateTime, // fallback to same day
      bookingNumber: text.match(patterns.bookingRef)?.[1],
      passengerName: text.match(patterns.passenger)?.[1]?.trim(),
      confidence: 0.7, // Medium confidence with pattern matching
    };
  } catch (error) {
    console.error('Error parsing flight ticket:', error);
    return null;
  }
}

/**
 * Parse hotel reservation using pattern matching
 */
function parseHotelReservation(text: string): HotelExtractionResult | null {
  const patterns = {
    // Hotel name - usually appears early, often in caps
    hotelName: /(?:hotel|resort|inn)[\s:]*([A-Z][A-Za-z\s&]+)/i,

    // Check-in/out
    checkIn: /check[-\s]?in[\s:]*(\d{1,2}[-/]\d{1,2}[-/]\d{2,4})/i,
    checkOut: /check[-\s]?out[\s:]*(\d{1,2}[-/]\d{1,2}[-/]\d{2,4})/i,

    // Guest name
    guest: /(?:guest|name)[\s:]*([A-Z][A-Za-z\s]+)/i,

    // Confirmation
    confirmation: /(?:confirmation|booking|reference)[\s:#]*([A-Z0-9]{6,12})/i,

    // Number of rooms
    rooms: /(\d+)\s*room/i,
  };

  try {
    const hotelMatch = text.match(patterns.hotelName);
    const checkInMatch = text.match(patterns.checkIn);
    const checkOutMatch = text.match(patterns.checkOut);

    if (!hotelMatch || !checkInMatch || !checkOutMatch) {
      return null;
    }

    return {
      type: 'hotel',
      name: hotelMatch[1].trim(),
      checkIn: checkInMatch[1],
      checkOut: checkOutMatch[1],
      guestName: text.match(patterns.guest)?.[1]?.trim(),
      confirmationNumber: text.match(patterns.confirmation)?.[1],
      numberOfRooms: parseInt(text.match(patterns.rooms)?.[1] || '1'),
      confidence: 0.7,
    };
  } catch (error) {
    console.error('Error parsing hotel reservation:', error);
    return null;
  }
}

/**
 * Main extraction function - tries to determine document type and extract data
 */
export async function extractTripDataFromPDF(
  file: File
): Promise<ExtractionResult> {
  try {
    // Step 1: Extract text from PDF
    const text = await extractTextFromPDF(file);

    // Step 2: Try to determine document type and extract data
    // Look for keywords to identify document type
    const lowerText = text.toLowerCase();

    if (
      lowerText.includes('flight') ||
      lowerText.includes('boarding') ||
      lowerText.includes('departure') ||
      lowerText.includes('airline')
    ) {
      return parseFlightTicket(text);
    } else if (
      lowerText.includes('hotel') ||
      lowerText.includes('reservation') ||
      lowerText.includes('check-in') ||
      lowerText.includes('check in')
    ) {
      return parseHotelReservation(text);
    }

    // If we can't determine type, return null
    return null;
  } catch (error) {
    console.error('PDF extraction error:', error);
    throw new Error(
      'Failed to extract data from PDF. Please enter details manually.'
    );
  }
}

/**
 * Validate extracted data
 */
export function validateExtractionResult(result: ExtractionResult): boolean {
  if (!result) return false;

  if (result.type === 'flight') {
    return Boolean(
      result.airline &&
        result.flightNumber &&
        result.departureAirportCode &&
        result.arrivalAirportCode &&
        result.departureDateTime
    );
  } else if (result.type === 'hotel') {
    return Boolean(result.name && result.checkIn && result.checkOut);
  }

  return false;
}

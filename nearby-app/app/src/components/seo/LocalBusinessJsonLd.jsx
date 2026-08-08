/**
 * Schema.org LocalBusiness structured data component
 * Full implementation following https://schema.org/LocalBusiness
 *
 * This component renders a JSON-LD script tag with business structured data
 * to help search engines understand and display business information.
 */

import { escapeForJsonLd } from '../../utils/sanitize';

function LocalBusinessJsonLd({ poi }) {
  if (!poi) return null;

  const baseUrl = window.location.origin;
  const businessUrl = `${baseUrl}/business/${poi.id}`;

  // Helper to get image URL
  const getImageUrl = (image) => {
    if (!image) return null;
    if (image.url) return image.url;
    if (image.thumbnail_url) return image.thumbnail_url;
    return null;
  };

  // Convert hours to Schema.org format
  const buildOpeningHours = () => {
    if (!poi.hours || !poi.hours.regular) return null;
    // #118 - no weekly schedule means no openingHours claim for search engines.
    if (poi.hours.no_regular_hours === true) return null;

    const dayMapping = {
      monday: 'Mo',
      tuesday: 'Tu',
      wednesday: 'We',
      thursday: 'Th',
      friday: 'Fr',
      saturday: 'Sa',
      sunday: 'Su'
    };

    const openingHoursSpec = [];

    Object.entries(poi.hours.regular).forEach(([day, dayHours]) => {
      if (dayHours && !dayHours.closed && dayHours.periods) {
        dayHours.periods.forEach(period => {
          if (period.open && period.close) {
            openingHoursSpec.push({
              "@type": "OpeningHoursSpecification",
              dayOfWeek: `https://schema.org/${day.charAt(0).toUpperCase() + day.slice(1)}`,
              opens: period.open,
              closes: period.close
            });
          }
        });
      }
    });

    return openingHoursSpec.length > 0 ? openingHoursSpec : null;
  };

  // Build address object
  const buildAddress = () => {
    if (!poi.address_street && !poi.address_city) return null;

    return {
      "@type": "PostalAddress",
      ...(poi.address_street && { streetAddress: poi.address_street }),
      ...(poi.address_city && { addressLocality: poi.address_city }),
      ...(poi.address_state && { addressRegion: poi.address_state }),
      ...(poi.address_zip && { postalCode: poi.address_zip }),
      addressCountry: "US"
    };
  };

  // Build geo coordinates
  const buildGeo = () => {
    if (poi.front_door_latitude && poi.front_door_longitude) {
      return {
        "@type": "GeoCoordinates",
        latitude: poi.front_door_latitude,
        longitude: poi.front_door_longitude
      };
    }
    if (poi.location?.coordinates) {
      return {
        "@type": "GeoCoordinates",
        latitude: poi.location.coordinates[1],
        longitude: poi.location.coordinates[0]
      };
    }
    return null;
  };

  // Build price range string
  const getPriceRange = () => {
    if (!poi.business?.price_level) return null;

    const level = poi.business.price_level;
    if (typeof level === 'number') {
      return '$'.repeat(Math.min(4, Math.max(1, level)));
    }
    if (typeof level === 'string') {
      if (level.toLowerCase() === 'budget' || level.toLowerCase() === 'low') return '$';
      if (level.toLowerCase() === 'moderate' || level.toLowerCase() === 'medium') return '$$';
      if (level.toLowerCase() === 'upscale' || level.toLowerCase() === 'high') return '$$$';
      if (level.toLowerCase() === 'fine dining' || level.toLowerCase() === 'luxury') return '$$$$';
    }
    return null;
  };

  // Build images array
  const buildImages = () => {
    const images = [];

    if (poi.main_image_url) {
      images.push(poi.main_image_url);
    }

    if (poi.images && Array.isArray(poi.images)) {
      poi.images.forEach(img => {
        const url = getImageUrl(img);
        if (url && !images.includes(url)) {
          images.push(url);
        }
      });
    }

    return images.length > 0 ? images : null;
  };

  // Build payment methods
  const buildPaymentAccepted = () => {
    if (!poi.business?.payment_methods || !Array.isArray(poi.business.payment_methods)) return null;

    const methodMapping = {
      'cash': 'Cash',
      'credit_card': 'Credit Card',
      'debit_card': 'Debit Card',
      'apple_pay': 'Apple Pay',
      'google_pay': 'Google Pay',
      'check': 'Check',
      'paypal': 'PayPal'
    };

    const methods = poi.business.payment_methods
      .map(method => methodMapping[method] || method)
      .join(', ');

    return methods || null;
  };

  // Determine the specific business type
  const getBusinessType = () => {
    // Default to LocalBusiness, but could be more specific based on categories
    if (poi.main_category) {
      const category = poi.main_category.toLowerCase();
      if (category.includes('restaurant') || category.includes('food')) return 'Restaurant';
      if (category.includes('bar') || category.includes('pub')) return 'BarOrPub';
      if (category.includes('cafe') || category.includes('coffee')) return 'CafeOrCoffeeShop';
      if (category.includes('hotel') || category.includes('lodging')) return 'LodgingBusiness';
      if (category.includes('store') || category.includes('shop') || category.includes('retail')) return 'Store';
      if (category.includes('salon') || category.includes('spa')) return 'BeautySalon';
      if (category.includes('gym') || category.includes('fitness')) return 'HealthClub';
      if (category.includes('dentist')) return 'Dentist';
      if (category.includes('doctor') || category.includes('medical') || category.includes('clinic')) return 'MedicalClinic';
      if (category.includes('attorney') || category.includes('lawyer') || category.includes('legal')) return 'LegalService';
      if (category.includes('bank')) return 'BankOrCreditUnion';
      if (category.includes('auto') || category.includes('car')) return 'AutoRepair';
    }
    return 'LocalBusiness';
  };

  // Build the main LocalBusiness schema
  const businessSchema = {
    "@context": "https://schema.org",
    "@type": getBusinessType(),
    "@id": businessUrl,
    name: poi.name,
    url: businessUrl
  };

  // Add description
  if (poi.description_short) {
    businessSchema.description = poi.description_short;
  } else if (poi.description_long) {
    businessSchema.description = poi.description_long.replace(/<[^>]*>/g, '').substring(0, 500);
  }

  // Add address
  const address = buildAddress();
  if (address) {
    businessSchema.address = address;
  }

  // Add geo
  const geo = buildGeo();
  if (geo) {
    businessSchema.geo = geo;
  }

  // Add contact info
  if (poi.phone_number) {
    businessSchema.telephone = poi.phone_number;
  }
  if (poi.email) {
    businessSchema.email = poi.email;
  }

  // Add website
  if (poi.website_url) {
    businessSchema.sameAs = poi.website_url.startsWith('http') ? poi.website_url : `https://${poi.website_url}`;
  }

  // Add social profiles
  const sameAs = [];
  if (poi.website_url) {
    sameAs.push(poi.website_url.startsWith('http') ? poi.website_url : `https://${poi.website_url}`);
  }
  if (poi.facebook_username) {
    sameAs.push(`https://www.facebook.com/${poi.facebook_username}`);
  }
  if (poi.instagram_username) {
    sameAs.push(`https://www.instagram.com/${poi.instagram_username}`);
  }
  if (poi.twitter_username) {
    sameAs.push(`https://twitter.com/${poi.twitter_username}`);
  }
  if (sameAs.length > 0) {
    businessSchema.sameAs = sameAs;
  }

  // Add opening hours
  const openingHours = buildOpeningHours();
  if (openingHours) {
    businessSchema.openingHoursSpecification = openingHours;
  }

  // Add price range
  const priceRange = getPriceRange();
  if (priceRange) {
    businessSchema.priceRange = priceRange;
  }

  // Add images
  const images = buildImages();
  if (images) {
    businessSchema.image = images;
  }

  // Add payment accepted
  const paymentAccepted = buildPaymentAccepted();
  if (paymentAccepted) {
    businessSchema.paymentAccepted = paymentAccepted;
  }

  // accessibilityFeature removed — wheelchair_accessible column dropped (Issue #45 PR2 Migration B)

  // Add amenities as additional property
  if (poi.amenities && Array.isArray(poi.amenities) && poi.amenities.length > 0) {
    businessSchema.amenityFeature = poi.amenities.map(amenity => ({
      "@type": "LocationFeatureSpecification",
      name: amenity,
      value: true
    }));
  }

  // Add menu link for restaurants
  if (poi.menu_url && (getBusinessType() === 'Restaurant' || getBusinessType() === 'CafeOrCoffeeShop')) {
    businessSchema.hasMenu = poi.menu_url.startsWith('http') ? poi.menu_url : `https://${poi.menu_url}`;
  }

  // Add reservation link
  if (poi.reservation_links && poi.reservation_links.length > 0) {
    businessSchema.acceptsReservations = true;
  }

  return (
    <script
      type="application/ld+json"
      dangerouslySetInnerHTML={{ __html: escapeForJsonLd(JSON.stringify(businessSchema, null, 2)) }}
    />
  );
}

export default LocalBusinessJsonLd;

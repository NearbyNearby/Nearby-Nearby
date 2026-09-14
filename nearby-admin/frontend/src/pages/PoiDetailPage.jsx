import { useEffect, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { Container, Title, Text, SimpleGrid, Paper, Group, Badge, Button, Image, Stack, Center, Accordion, Grid, Box, ActionIcon, Tooltip, Card, Skeleton, ThemeIcon, Divider } from '@mantine/core';
import { IconShare, IconHeart, IconMapPin, IconPhone, IconMail, IconWorldWww, IconCheck, IconArrowRight, IconCurrentLocation, IconClock, IconCar, IconInfoCircle, IconCamera, IconMap, IconBuilding, IconTree, IconRoute, IconCalendar, IconLink } from '@tabler/icons-react';
import api from '../utils/api';
import L from 'leaflet';
import { MapContainer, TileLayer, Marker, Popup, Tooltip as LeafletTooltip, AttributionControl } from 'react-leaflet';
import { createCustomIcon, getPoiColor, legendData, createTooltipText, getIconSymbol } from '../utils/mapUtils';
import RelationshipManager from '../components/RelationshipManager';

// Helper function to format distance
const formatDistance = (meters) => {
    if (!meters) return null;
    const miles = meters * 0.000621371; // Convert meters to miles
    if (miles < 1) {
        return `${(miles * 5280).toFixed(0)}ft`; // Convert to feet for distances less than 1 mile
    } else {
        return `${miles.toFixed(1)}mi`;
    }
};

// Fix for default Leaflet icon path issue with bundlers like Vite
delete L.Icon.Default.prototype._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://unpkg.com/leaflet@1.7.1/dist/images/marker-icon-2x.png',
  iconUrl: 'https://unpkg.com/leaflet@1.7.1/dist/images/marker-icon.png',
  shadowUrl: 'https://unpkg.com/leaflet@1.7.1/dist/images/marker-shadow.png',
});
const goldIcon = new L.Icon({
    iconUrl: 'https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-2x-gold.png',
    shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/0.7.7/images/marker-shadow.png',
    iconSize: [25, 41], iconAnchor: [12, 41], popupAnchor: [1, -34], shadowSize: [41, 41]
});

// Add custom CSS for tooltips and markers
const customStyles = `
  .custom-tooltip {
    background: white !important;
    border: 1px solid #e5e7eb !important;
    border-radius: 6px !important;
    color: #374151 !important;
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif !important;
    font-size: 12px !important;
    padding: 6px 10px !important;
    box-shadow: 0 2px 8px rgba(0, 0, 0, 0.15) !important;
    white-space: nowrap !important;
    max-width: 250px !important;
    overflow: hidden !important;
    text-overflow: ellipsis !important;
  }
  
  .custom-tooltip::before {
    border-top-color: white !important;
  }
  
  .custom-marker {
    background: transparent !important;
    border: none !important;
  }
  
  .custom-marker div {
    transition: transform 0.2s ease, box-shadow 0.2s ease;
  }
  
  .custom-marker:hover div {
    transform: scale(1.1);
    box-shadow: 0 4px 12px rgba(0,0,0,0.4) !important;
  }
  
  @keyframes pulse {
    0% {
      transform: scale(1);
      opacity: 1;
    }
    50% {
      transform: scale(1.1);
      opacity: 0.8;
    }
    100% {
      transform: scale(1);
      opacity: 1;
    }
  }
  
  .current-poi-marker div {
    animation: pulse 2s infinite;
  }
`;

// Inject custom styles
if (typeof document !== 'undefined') {
  const styleElement = document.createElement('style');
  styleElement.textContent = customStyles;
  document.head.appendChild(styleElement);
}


const DetailItem = ({ label, value, icon }) => {
    const hasValue = value && (Array.isArray(value) ? value.length > 0 : value.trim && value.trim() !== '');
    return (
        <Box>
            <Group gap="xs" mb={4}>
                {icon && <ThemeIcon size="sm" variant="light" color="gray"><icon.type {...icon.props} size={14} /></ThemeIcon>}
                <Text size="sm" c="dimmed" fw={500}>{label}</Text>
            </Group>
            <Text c={hasValue ? undefined : "dimmed"} fs={hasValue ? undefined : "italic"}>
                {hasValue ? (Array.isArray(value) ? value.join(', ') : value) : 'Not available'}
            </Text>
        </Box>
    )
}

const HoursDisplay = ({ hours }) => {
    if (!hours) return null;
    
    const formatHours = (hoursData) => {
        if (typeof hoursData === 'string') return hoursData;
        if (hoursData.text) return hoursData.text;
        
        const days = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'];
        return days.map(day => {
            const dayHours = hoursData[day];
            if (!dayHours || dayHours.length === 0) return null;
            
            const formattedHours = dayHours.map(period => 
                `${period.open} - ${period.close}`
            ).join(', ');
            
            return `${day.charAt(0).toUpperCase() + day.slice(1)}: ${formattedHours}`;
        }).filter(Boolean).join('\n');
    };
    
    return <DetailItem label="Hours" value={formatHours(hours)} icon={{ type: IconClock, props: {} }} />
}

const MapLegend = () => (
    <div
        style={{
            position: 'absolute',
            bottom: 20,
            left: 20,
            zIndex: 1000,
            padding: '8px',
            backgroundColor: 'white',
            borderRadius: '6px',
            boxShadow: '0 2px 8px rgba(0,0,0,0.15)',
            minWidth: '140px',
            border: '1px solid #e5e7eb'
        }}
    >
        <Text size="sm" fw={600} mb={4}>POI Types</Text>
        <Stack gap={4}>
            {legendData.map((item) => (
                <Group key={item.type} gap={6} wrap="nowrap">
                    <div
                        style={{
                            width: '18px',
                            height: '18px',
                            borderRadius: '50%',
                            backgroundColor: item.color,
                            border: '2px solid white',
                            boxShadow: '0 1px 4px rgba(0,0,0,0.2)',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            fontSize: '9px',
                            color: 'white',
                            fontWeight: 'bold'
                        }}
                    >
                        {item.icon}
                    </div>
                    <Text size="xs" style={{ flex: 1 }}>{item.label}</Text>
                </Group>
            ))}
        </Stack>
    </div>
);

const NearbyMap = ({ poi }) => {
    const [nearbyPois, setNearbyPois] = useState([]);
    useEffect(() => {
        if (poi) {
            api.get(`/pois/${poi.id}/nearby?limit=6&distance_km=3.0`)
                .then(response => response.json())
                .then(data => setNearbyPois(data))
                .catch(err => console.error("Failed to fetch nearby POIs", err));
        }
    }, [poi]);
    
    if(!poi) return null;
    
    // Safety check for location coordinates
    if (!poi.location?.coordinates || poi.location.coordinates.length !== 2) {
        return (
            <Box>
                <Text c="dimmed" ta="center" py="xl">
                    Location data not available for this POI
                </Text>
            </Box>
        );
    }
    
    const centerPosition = [poi.location.coordinates[1], poi.location.coordinates[0]];

    return (
        <Box style={{ position: 'relative' }}>
            <MapContainer center={centerPosition} zoom={13} style={{ height: '400px', width: '100%', borderRadius: '12px', overflow: 'hidden' }} attributionControl={false}>
                {/* #102: Leaflet's default prefix is "🇺🇦 Leaflet"; drop the flag, keep the credit. */}
                <AttributionControl position="bottomright" prefix="Leaflet" />
                <TileLayer
                    url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
                    attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
                />
                {/* Current POI Marker */}
                <Marker position={centerPosition} icon={L.divIcon({
                    html: `
                        <div style="
                            background: ${getPoiColor(poi.poi_type || 'business')};
                            width: 28px;
                            height: 28px;
                            border-radius: 50%;
                            border: 3px solid white;
                            box-shadow: 0 4px 12px rgba(0,0,0,0.4);
                            display: flex;
                            align-items: center;
                            justify-content: center;
                            color: white;
                            font-size: 13px;
                            font-weight: bold;
                        ">
                            ${getIconSymbol(poi.poi_type || 'business')}
                        </div>
                    `,
                    className: 'custom-marker current-poi-marker',
                    iconSize: [28, 28],
                    iconAnchor: [14, 14],
                    popupAnchor: [0, -14]
                })}>
                    <Popup>{poi.name} (Current)</Popup>
                    <LeafletTooltip 
                        permanent={false}
                        direction="top"
                        offset={[0, -8]}
                        opacity={0.9}
                        className="custom-tooltip"
                    >
                        {createTooltipText(poi)}
                    </LeafletTooltip>
                </Marker>
                {/* Nearby POI Markers */}
                {nearbyPois.map(p => {
                    const coords = p.location?.coordinates;
                    if (!coords || coords.length !== 2) return null;
                    const position = [coords[1], coords[0]];
                    const poiType = p.poi_type || 'business';
                    const iconColor = getPoiColor(poiType);
                    const customIcon = createCustomIcon(poiType, iconColor);
                    
                    return (
                        <Marker key={p.id} position={position} icon={customIcon}>
                            <Popup><Link to={`/poi/detail/${p.id}`}>{p.name}</Link></Popup>
                            <LeafletTooltip 
                                permanent={false}
                                direction="top"
                                offset={[0, -8]}
                                opacity={0.9}
                                className="custom-tooltip"
                            >
                                {createTooltipText(p)}
                            </LeafletTooltip>
                        </Marker>
                    );
                })}
                <MapLegend />
            </MapContainer>

            
            <SimpleGrid cols={{ base: 2, sm: 3, lg: 3 }} mt="lg">
                {nearbyPois.map(p => (
                    <Card withBorder component={Link} to={`/poi/detail/${p.id}`} p="sm" key={p.id}>
                        <Stack gap="xs">
                            <Text size="sm" fw={500} truncate="end">{p.name}</Text>
                            <Group gap="xs" justify="space-between">
                                <Badge size="xs" color={p.status === 'Fully Open' ? 'green' : 'orange'}>{p.status}</Badge>
                                {p.distance_meters && (
                                    <Text size="xs" c="dimmed">
                                        {formatDistance(p.distance_meters)}
                                    </Text>
                                )}
                            </Group>
                        </Stack>
                    </Card>
                ))}
            </SimpleGrid>
        </Box>
    )
}



const PoiDetailPage = () => {
    const { id } = useParams();
    const [poi, setPoi] = useState(null);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        setLoading(true);
        api.get(`/pois/${id}`)
            .then(response => response.json())
            .then(data => setPoi(data))
            .catch(err => console.error("Failed to fetch POI", err))
            .finally(() => setLoading(false));
    }, [id]);

    if (loading) {
        return <Container mt="xl"><Skeleton height={50} /><SimpleGrid cols={2} mt="lg"><Skeleton height={300} /><Skeleton height={300} /></SimpleGrid></Container>
    }

    if (!poi) {
        return <Container><Center><Text>Point of Interest not found.</Text></Center></Container>;
    }
    
    // Extract data from different sources
    const amenities = poi.amenities || {};
    const contactInfo = poi.contact_info || {};
    const compliance = poi.compliance || {};
    const customFields = poi.custom_fields || {};
    
    const keyFeatures = [
        poi.public_toilets?.includes('yes') ? 'Public Toilet' : null,
        // wheelchair_accessible removed — column dropped (Issue #45 PR2 Migration B)
        poi.parking_types?.includes('street') ? 'Parking on Street' : null,
        poi.parking_types?.includes('lot') ? 'Parking Lot' : null,
        poi.playground_available ? 'Playground Available' : null,
        poi.pet_options?.includes('allowed') ? 'Pet Friendly' : null,
        poi.wifi_options?.includes('free') ? 'Free WiFi' : null,
    ].filter(Boolean);

    // Get POI type specific data
    const getPoiTypeData = () => {
        switch (poi.poi_type) {
            case 'BUSINESS':
                return {
                    priceRange: poi.business?.price_range || poi.price_range_per_person,
                    listingTier: poi.listing_type,
                    businessAmenities: poi.business_amenities,
                    entertainmentOptions: poi.entertainment_options,
                    youthAmenities: poi.youth_amenities,
                    menuLink: poi.menu_link,
                    deliveryLinks: poi.delivery_links,
                    reservationLinks: poi.reservation_links,
                };
            case 'TRAIL':
                return {
                    length: poi.trail?.length_text,
                    difficulty: poi.trail?.difficulty,
                    routeType: poi.trail?.route_type,
                    trailSurfaces: poi.trail?.trail_surfaces,
                    trailExperiences: poi.trail?.trail_experiences,
                    downloadableMap: poi.trail?.downloadable_trail_map,
                };
            case 'PARK':
                return {
                    dronePolicy: poi.park?.drone_usage_policy || poi.drone_policy,
                    naturalFeatures: poi.natural_features,
                    thingsToDo: poi.things_to_do,
                    huntingFishing: poi.hunting_fishing_allowed,
                };
            case 'EVENT':
                return {
                    startTime: poi.event?.start_datetime,
                    endTime: poi.event?.end_datetime,
                    cost: poi.cost || poi.pricing,
                    organizer: poi.event?.organizer_name,
                    venueSettings: poi.event?.venue_settings,
                    hasVendors: poi.event?.has_vendors,
                };
            default:
                return {};
        }
    };

    const poiTypeData = getPoiTypeData();

    return (
        <Box>
            <Paper shadow="xs" p="xs">
                 <Container>
                    <Group justify="space-between">
                         <Group component={Link} to="/" style={{textDecoration: 'none', color: 'inherit'}}>
                            <Image src="/vite.svg" h={30} />
                            <Title order={4}>Nearby Nearby</Title>
                         </Group>
                        <Button variant="outline" radius="xl">@Username</Button>
                    </Group>
                </Container>
            </Paper>
            <Container mt="lg">
                <Text size="sm" c="dimmed">STATUS: {poi.status} {poi.status_message && `- ${poi.status_message}`}</Text>
                <Grid mt="md">
                    <Grid.Col span={{ base: 12, md: 8 }}>
                        <Title>{poi.name}</Title>
                        <Text c="dimmed">{poi.address_city || 'Location not available'}, Chatham County</Text>
                        <Group mt="xs" gap="sm">
                            {poi.is_verified && <Badge color="teal" leftSection={<IconCheck size={14}/>}>Verified</Badge>}
                            <Badge variant="light">{poi.status}</Badge>
                        </Group>
                    </Grid.Col>
                    <Grid.Col span={{ base: 12, md: 4 }}>
                         <Group justify="flex-end">
                            <Tooltip label="Share"><ActionIcon variant="default" size="lg"><IconShare size={18}/></ActionIcon></Tooltip>
                            <Tooltip label="Favorite"><ActionIcon variant="default" size="lg"><IconHeart size={18}/></ActionIcon></Tooltip>
                        </Group>
                    </Grid.Col>
                </Grid>

                <Grid mt="lg" gutter="xl">
                    <Grid.Col span={{ base: 12, md: 4 }}>
                        <Stack>
                            <DetailItem 
                                label="Location" 
                                value={
                                    poi.address_full || 
                                    (poi.address_street && poi.address_city && poi.address_state ? 
                                        `${poi.address_street}, ${poi.address_city}, ${poi.address_state}` : 
                                        null)
                                } 
                                icon={{ type: IconMapPin, props: {} }} 
                            />
                            <DetailItem label="Category" value={poi.categories?.map(c => c.name).join(', ')} icon={{ type: IconInfoCircle, props: {} }} />
                            <DetailItem label="Cost" value={poiTypeData.priceRange || poiTypeData.cost || poi.cost || poi.pricing} icon={{ type: IconBuilding, props: {} }} />
                            {poi.pricing_details && (
                                <DetailItem label="Pricing Details" value={poi.pricing_details} icon={{ type: IconBuilding, props: {} }} />
                            )}
                            {(poi.ticket_links || poi.event?.ticket_links || []).map((tl, i) => (
                                <DetailItem
                                    key={i}
                                    label={tl.platform || tl.name || 'Tickets'}
                                    value={tl.url}
                                    icon={{ type: IconLink, props: {} }}
                                />
                            ))}
                            <DetailItem label="Phone Number" value={poi.phone_number} icon={{ type: IconPhone, props: {} }} />
                            <DetailItem label="Website" value={poi.website_url} icon={{ type: IconWorldWww, props: {} }} />
                            <DetailItem label="Good For" value={poi.ideal_for || poi.ideal_for_key} icon={{ type: IconCheck, props: {} }} />
                            <DetailItem label="Key Features" value={keyFeatures} icon={{ type: IconCheck, props: {} }} />
                            <DetailItem label="Pets" value={poi.pet_options} icon={{ type: IconInfoCircle, props: {} }} />
                        </Stack>
                    </Grid.Col>
                    <Grid.Col span={{ base: 12, md: 8 }}>
                        {poi.photos?.featured || poi.photos?.gallery?.length > 0 || poi.gallery_photos?.length > 0 || poi.featured_image ? (
                            <SimpleGrid cols={2} gap="sm">
                                {(poi.photos?.featured || poi.featured_image) && (
                                    <Image
                                        src={poi.photos?.featured || poi.featured_image}
                                        radius="md"
                                        style={{ aspectRatio: '1', objectFit: 'cover' }}
                                    />
                                )}
                                {poi.photos?.gallery?.slice(0, 3).map((url, i) => (
                                    <Image 
                                        key={i} 
                                        src={url} 
                                        radius="md" 
                                        style={{ aspectRatio: '1', objectFit: 'cover' }}
                                    />
                                ))}
                                {poi.gallery_photos?.slice(0, 2).map((url, i) => (
                                    <Image
                                        key={`gallery-${i}`}
                                        src={url}
                                        radius="md"
                                        style={{ aspectRatio: '1', objectFit: 'cover' }}
                                    />
                                ))}
                            </SimpleGrid>
                        ) : (
                            <SimpleGrid cols={2} gap="sm">
                                {[1, 2, 3, 4].map((i) => (
                                    <Box 
                                        key={i}
                                        style={{ 
                                            aspectRatio: '1', 
                                            backgroundColor: 'var(--mantine-color-gray-2)', 
                                            borderRadius: '8px',
                                            display: 'flex',
                                            alignItems: 'center',
                                            justifyContent: 'center'
                                        }}
                                    >
                                        <IconCamera size={24} color="var(--mantine-color-gray-5)" />
                                    </Box>
                                ))}
                            </SimpleGrid>
                        )}
                    </Grid.Col>
                </Grid>
                
                <Accordion 
                    chevronPosition="right" 
                    variant="filled" 
                    mt="xl"
                    styles={{
                        control: {
                            backgroundColor: 'var(--mantine-color-gray-1)',
                            color: 'var(--mantine-color-gray-8)',
                            borderRadius: '12px',
                            '&:hover': {
                                backgroundColor: 'var(--mantine-color-gray-2)',
                            },
                        },
                        item: {
                            border: 'none',
                            marginBottom: '8px',
                            borderRadius: '12px',
                        },
                        panel: {
                            backgroundColor: 'var(--mantine-color-gray-0)',
                            color: 'var(--mantine-color-gray-7)',
                            borderBottomLeftRadius: '12px',
                            borderBottomRightRadius: '12px',
                        },
                        content: {
                            backgroundColor: 'var(--mantine-color-gray-0)',
                            borderBottomLeftRadius: '12px',
                            borderBottomRightRadius: '12px',
                        }
                    }}
                >
                    <Accordion.Item value="about">
                        <Accordion.Control icon={<IconInfoCircle size={18} />}>
                            About & Description
                        </Accordion.Control>
                        <Accordion.Panel>
                            <Stack gap="md">
                                {poi.description_long && (
                                    <DetailItem label="Full Description" value={poi.description_long} />
                                )}
                                {poi.description_short && (
                                    <DetailItem label="Short Description" value={poi.description_short} />
                                )}
                                {poi.teaser_paragraph && (
                                    <DetailItem label="Summary" value={poi.teaser_paragraph} />
                                )}
                                {poi.history_paragraph && (
                                    <DetailItem label="History" value={poi.history_paragraph} />
                                )}
                                <HoursDisplay hours={poi.hours} />
                                {/* Issue #70: holiday_hours top-level column is deprecated.
                                    Holiday hours now live in poi.hours.holidays and render
                                    inside <HoursDisplay /> above. */}
                                {poi.hours?.holidays && Object.keys(poi.hours.holidays).length > 0 && (
                                    <DetailItem label="Holiday Hours" value={JSON.stringify(poi.hours.holidays)} />
                                )}
                                {poiTypeData.length && (
                                    <DetailItem label="Length" value={poiTypeData.length} icon={{ type: IconRoute, props: {} }} />
                                )}
                                {poiTypeData.difficulty && (
                                    <DetailItem label="Difficulty" value={poiTypeData.difficulty} icon={{ type: IconRoute, props: {} }} />
                                )}
                                {poiTypeData.routeType && (
                                    <DetailItem label="Route Type" value={poiTypeData.routeType} icon={{ type: IconRoute, props: {} }} />
                                )}
                                {poiTypeData.trailSurfaces && (
                                    <DetailItem label="Trail Surfaces" value={poiTypeData.trailSurfaces} icon={{ type: IconRoute, props: {} }} />
                                )}
                                {poiTypeData.trailExperiences && (
                                    <DetailItem label="Trail Experience" value={poiTypeData.trailExperiences} icon={{ type: IconRoute, props: {} }} />
                                )}
                                {poiTypeData.naturalFeatures && (
                                    <DetailItem label="Natural Features" value={poiTypeData.naturalFeatures} icon={{ type: IconTree, props: {} }} />
                                )}
                                {poiTypeData.thingsToDo && (
                                    <DetailItem label="Activities" value={poiTypeData.thingsToDo} icon={{ type: IconCheck, props: {} }} />
                                )}
                                {poiTypeData.organizer && (
                                    <DetailItem label="Event Organizer" value={poiTypeData.organizer} icon={{ type: IconInfoCircle, props: {} }} />
                                )}
                                {poiTypeData.venueSettings && (
                                    <DetailItem label="Venue Type" value={poiTypeData.venueSettings} icon={{ type: IconBuilding, props: {} }} />
                                )}
                            </Stack>
                        </Accordion.Panel>
                    </Accordion.Item>
                    
                    <Accordion.Item value="contact">
                        <Accordion.Control icon={<IconPhone size={18} />}>
                            Contact Information
                        </Accordion.Control>
                        <Accordion.Panel>
                            <Stack gap="md">
                                <DetailItem label="Email" value={poi.email} icon={{ type: IconMail, props: {} }} />
                                <DetailItem label="Phone" value={poi.phone_number} icon={{ type: IconPhone, props: {} }} />
                                <DetailItem label="Website" value={poi.website_url} icon={{ type: IconWorldWww, props: {} }} />
                                {poi.instagram_username && (
                                    <DetailItem label="Instagram" value={`@${poi.instagram_username}`} icon={{ type: IconLink, props: {} }} />
                                )}
                                {poi.facebook_username && (
                                    <DetailItem label="Facebook" value={poi.facebook_username} icon={{ type: IconLink, props: {} }} />
                                )}
                                {contactInfo.best && (
                                    <DetailItem label="Best Contact" value={`${contactInfo.best.name} - ${contactInfo.best.phone}`} icon={{ type: IconPhone, props: {} }} />
                                )}
                                {contactInfo.emergency && (
                                    <DetailItem label="Emergency Contact" value={`${contactInfo.emergency.name} - ${contactInfo.emergency.phone}`} icon={{ type: IconPhone, props: {} }} />
                                )}
                            </Stack>
                        </Accordion.Panel>
                    </Accordion.Item>
                    
                    <Accordion.Item value="parking">
                        <Accordion.Control icon={<IconCar size={18} />}>
                            Address & Parking
                        </Accordion.Control>
                        <Accordion.Panel>
                            <Stack gap="md">
                                <DetailItem label="Full Address" value={poi.address_full} icon={{ type: IconMapPin, props: {} }} />
                                <DetailItem label="Street Address" value={poi.address_street} icon={{ type: IconMapPin, props: {} }} />
                                <DetailItem label="City" value={poi.address_city} icon={{ type: IconMapPin, props: {} }} />
                                <DetailItem label="State" value={poi.address_state} icon={{ type: IconMapPin, props: {} }} />
                                <DetailItem label="ZIP Code" value={poi.address_zip} icon={{ type: IconMapPin, props: {} }} />
                                <DetailItem label="Parking Options" value={poi.parking_types} icon={{ type: IconCar, props: {} }} />
                                <DetailItem label="Parking Notes" value={poi.parking_notes} icon={{ type: IconCar, props: {} }} />
                                <DetailItem label="Expected Parking Cost" value={poi.expect_to_pay_parking} icon={{ type: IconCar, props: {} }} />
                                {/* public_transit_info removed — renamed _deprecated_public_transit_info (Migration A #33) */}
                                {/* wheelchair_accessible removed — column dropped (Issue #45 PR2 Migration B) */}
                                <DetailItem label="Accessibility Details" value={poi.wheelchair_details} icon={{ type: IconInfoCircle, props: {} }} />
                            </Stack>
                        </Accordion.Panel>
                    </Accordion.Item>
                    
                    <Accordion.Item value="amenities">
                        <Accordion.Control icon={<IconCheck size={18} />}>
                            Amenities & Features
                        </Accordion.Control>
                        <Accordion.Panel>
                            <Stack gap="md">
                                <DetailItem label="Payment Methods" value={poi.payment_methods} icon={{ type: IconInfoCircle, props: {} }} />
                                <DetailItem label="Ideal For" value={poi.ideal_for || poi.ideal_for_key} icon={{ type: IconCheck, props: {} }} />
                                <DetailItem label="Public Toilets" value={poi.public_toilets} icon={{ type: IconInfoCircle, props: {} }} />
                                <DetailItem label="Toilet Details" value={poi.toilet_description} icon={{ type: IconInfoCircle, props: {} }} />
                                <DetailItem label="Pets Allowed" value={poi.pet_options} icon={{ type: IconInfoCircle, props: {} }} />
                                <DetailItem label="Pet Policy" value={poi.pet_policy} icon={{ type: IconInfoCircle, props: {} }} />
                                <DetailItem label="Alcohol Available" value={poi.alcohol_options} icon={{ type: IconInfoCircle, props: {} }} />
                                <DetailItem label="WiFi Available" value={poi.wifi_options} icon={{ type: IconInfoCircle, props: {} }} />
                                {/* key_facilities removed — renamed _deprecated_key_facilities (Migration A #34) */}
                                {poiTypeData.dronePolicy && (
                                    <DetailItem label="Drone Policy" value={poiTypeData.dronePolicy} icon={{ type: IconTree, props: {} }} />
                                )}
                                {compliance.pre_approval_required && (
                                    <DetailItem label="Pre-approval Required" value="Yes" icon={{ type: IconInfoCircle, props: {} }} />
                                )}
                                {compliance.lead_time && (
                                    <DetailItem label="Lead Time" value={compliance.lead_time} icon={{ type: IconClock, props: {} }} />
                                )}
                                {poi.available_for_rent && (
                                    <DetailItem label="Available for Rent" value="Yes" icon={{ type: IconCheck, props: {} }} />
                                )}
                                {poi.rental_info && (
                                    <DetailItem label="Rental Information" value={poi.rental_info} icon={{ type: IconInfoCircle, props: {} }} />
                                )}
                                {poi.rental_pricing && (
                                    <DetailItem label="Rental Pricing" value={poi.rental_pricing} icon={{ type: IconBuilding, props: {} }} />
                                )}
                                {poi.playground_available && (
                                    <DetailItem label="Playground" value="Available" icon={{ type: IconCheck, props: {} }} />
                                )}
                                {poi.playground_notes && (
                                    <DetailItem label="Playground Details" value={poi.playground_notes} icon={{ type: IconInfoCircle, props: {} }} />
                                )}
                                {poiTypeData.businessAmenities && (
                                    <DetailItem label="Business Amenities" value={poiTypeData.businessAmenities} icon={{ type: IconCheck, props: {} }} />
                                )}
                                {poiTypeData.entertainmentOptions && (
                                    <DetailItem label="Entertainment" value={poiTypeData.entertainmentOptions} icon={{ type: IconCheck, props: {} }} />
                                )}
                                {poiTypeData.menuLink && (
                                    <DetailItem label="Menu" value={poiTypeData.menuLink} icon={{ type: IconLink, props: {} }} />
                                )}
                            </Stack>
                        </Accordion.Panel>
                    </Accordion.Item>
                    
                    {poiTypeData.startTime && (
                        <Accordion.Item value="event">
                            <Accordion.Control icon={<IconCalendar size={18} />}>
                                Event Details
                            </Accordion.Control>
                            <Accordion.Panel>
                                <Stack gap="md">
                                    <DetailItem label="Start Time" value={new Date(poiTypeData.startTime).toLocaleString()} icon={{ type: IconCalendar, props: {} }} />
                                    {poiTypeData.endTime && (
                                        <DetailItem label="End Time" value={new Date(poiTypeData.endTime).toLocaleString()} icon={{ type: IconCalendar, props: {} }} />
                                    )}
                                    <DetailItem label="Cost" value={poiTypeData.cost} icon={{ type: IconBuilding, props: {} }} />
                                </Stack>
                            </Accordion.Panel>
                        </Accordion.Item>
                    )}
                    
                    <Accordion.Item value="photos">
                        <Accordion.Control icon={<IconCamera size={18} />}>
                            Photos & Gallery
                        </Accordion.Control>
                        <Accordion.Panel>
                            <Stack gap="md">
                                {poi.photos?.featured && (
                                    <Box>
                                        <Text size="sm" c="dimmed" mb="xs">Featured Photo</Text>
                                        <Image src={poi.photos.featured} radius="md" />
                                    </Box>
                                )}
                                {poi.photos?.gallery && poi.photos.gallery.length > 0 && (
                                    <Box>
                                        <Text size="sm" c="dimmed" mb="xs">Photo Gallery</Text>
                                        <SimpleGrid cols={3}>
                                            {poi.photos.gallery.map((url, i) => (
                                                <Image key={i} src={url} radius="md" />
                                            ))}
                                        </SimpleGrid>
                                    </Box>
                                )}
                                {poi.gallery_photos && poi.gallery_photos.length > 0 && (
                                    <Box>
                                        <Text size="sm" c="dimmed" mb="xs">Gallery Photos</Text>
                                        <SimpleGrid cols={3}>
                                            {poi.gallery_photos.filter(url => url).map((url, i) => (
                                                <Image key={i} src={url} radius="md" />
                                            ))}
                                        </SimpleGrid>
                                    </Box>
                                )}
                                {poi.menu_photos && poi.menu_photos.length > 0 && (
                                    <Box>
                                        <Text size="sm" c="dimmed" mb="xs">Menu Photos</Text>
                                        <SimpleGrid cols={3}>
                                            {poi.menu_photos.filter(url => url).map((url, i) => (
                                                <Image key={i} src={url} radius="md" />
                                            ))}
                                        </SimpleGrid>
                                    </Box>
                                )}
                                {poi.parking_photos && poi.parking_photos.length > 0 && (
                                    <Box>
                                        <Text size="sm" c="dimmed" mb="xs">Parking Photos</Text>
                                        <SimpleGrid cols={3}>
                                            {poi.parking_photos.filter(url => url).map((url, i) => (
                                                <Image key={i} src={url} radius="md" />
                                            ))}
                                        </SimpleGrid>
                                    </Box>
                                )}
                                {poi.playground_photos && poi.playground_photos.length > 0 && (
                                    <Box>
                                        <Text size="sm" c="dimmed" mb="xs">Playground Photos</Text>
                                        <SimpleGrid cols={3}>
                                            {poi.playground_photos.filter(url => url).map((url, i) => (
                                                <Image key={i} src={url} radius="md" />
                                            ))}
                                        </SimpleGrid>
                                    </Box>
                                )}
                            </Stack>
                        </Accordion.Panel>
                    </Accordion.Item>
                    
                    {poi.poi_type === 'BUSINESS' && (poiTypeData.deliveryLinks || poiTypeData.reservationLinks || poi.appointment_links || poi.online_ordering_links) && (
                        <Accordion.Item value="business-services">
                            <Accordion.Control icon={<IconLink size={18} />}>
                                Business Services & Links
                            </Accordion.Control>
                            <Accordion.Panel>
                                <Stack gap="md">
                                    {poiTypeData.deliveryLinks && (
                                        <DetailItem label="Delivery Services" value={poiTypeData.deliveryLinks} icon={{ type: IconLink, props: {} }} />
                                    )}
                                    {poiTypeData.reservationLinks && (
                                        <DetailItem label="Make Reservations" value={poiTypeData.reservationLinks} icon={{ type: IconLink, props: {} }} />
                                    )}
                                    {poi.appointment_links && (
                                        <DetailItem label="Book Appointment" value={poi.appointment_links} icon={{ type: IconLink, props: {} }} />
                                    )}
                                    {poi.online_ordering_links && (
                                        <DetailItem label="Order Online" value={poi.online_ordering_links} icon={{ type: IconLink, props: {} }} />
                                    )}
                                    {poi.appointment_booking_url && (
                                        <DetailItem label="Appointment Booking" value={poi.appointment_booking_url} icon={{ type: IconLink, props: {} }} />
                                    )}
                                    {poi.hours_but_appointment_required && (
                                        <DetailItem label="Appointment Required" value="Yes" icon={{ type: IconInfoCircle, props: {} }} />
                                    )}
                                    {poi.discounts && (
                                        <DetailItem label="Available Discounts" value={poi.discounts} icon={{ type: IconCheck, props: {} }} />
                                    )}
                                    {poi.gift_cards && (
                                        <DetailItem label="Gift Cards" value={poi.gift_cards} icon={{ type: IconCheck, props: {} }} />
                                    )}
                                </Stack>
                            </Accordion.Panel>
                        </Accordion.Item>
                    )}

                    {Object.keys(customFields).length > 0 && (
                        <Accordion.Item value="custom">
                            <Accordion.Control icon={<IconInfoCircle size={18} />}>
                                Additional Information
                            </Accordion.Control>
                            <Accordion.Panel>
                                <Stack gap="md">
                                    {Object.entries(customFields).map(([key, value]) => (
                                        <DetailItem key={key} label={key} value={value} />
                                    ))}
                                </Stack>
                            </Accordion.Panel>
                        </Accordion.Item>
                    )}
                    
                    <Accordion.Item value="related">
                        <Accordion.Control icon={<IconLink size={18} />}>
                            Related POIs
                        </Accordion.Control>
                        <Accordion.Panel>
                            <RelationshipManager 
                                poiId={poi.id} 
                                poiType={poi.poi_type} 
                                poiName={poi.name}
                                showManageButton={false}
                                readOnly={true}
                            />
                        </Accordion.Panel>
                    </Accordion.Item>
                </Accordion>
                
                 <Box mt={60}>
                    <Center><Title order={3} c="dimmed">NEARBY POINTS OF INTEREST</Title></Center>
                    <NearbyMap poi={poi} />
                </Box>
            </Container>
        </Box>
    );
};

export default PoiDetailPage;
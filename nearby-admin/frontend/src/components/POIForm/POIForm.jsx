import { useState, lazy, Suspense, useEffect, useRef } from 'react';
import { useParams, useNavigate, useLocation } from 'react-router-dom';
import {
  Container, Stack, Box, Title, Text, Accordion, Group, Badge,
  Alert, Button, Affix, Transition, rem, Loader
} from '@mantine/core';
import { useWindowScroll } from '@mantine/hooks';
import { IconChevronUp } from '@tabler/icons-react';
import { modals } from '@mantine/modals';

// Hooks
import { usePOIForm } from './hooks/usePOIForm';
import { usePOIHandlers } from './hooks/usePOIHandlers.jsx';
import { useAutoSave } from './hooks/useAutoSave';

// Components
import { FormActions } from './components/FormActions';
import { SaveStatus } from './components/SaveStatus';
import { CoreInformationSection } from './sections/CoreInformationSection';
import { CategoriesSection } from './sections/CategoriesSection';
import { ContactSection } from './sections/ContactSection';

// Additional sections
import HoursSelector from '../HoursSelector';
import DynamicAttributeForm from '../DynamicAttributeForm';

// Import all section components
import { LocationSection } from './sections/LocationSection';
import {
  BusinessDetailsSection,
  MenuBookingSection,
  BusinessGallerySection,
  BusinessEntrySection
} from './sections/BusinessDetailsSection';
import {
  FacilitiesSection,
  PublicAmenitiesSection,
  RentalsSection
} from './sections/FacilitiesSection';
import {
  EventVendorsSection,
  EventAmenitiesSection,
  EventMapsSection,
  EventVenueSection,
  EventStatusSection,
  EventOrganizerSection,
  EventCostSection,
  EventSponsorsSection
} from './sections/EventSpecificSections';
import { TrailDetailsSection } from './sections/TrailSpecificSections';
import {
  OutdoorFeaturesSection,
  HuntingFishingSection,
  PetPolicySection,
  PlaygroundSection
} from './sections/OutdoorFeaturesSection';
import { ParkCategoriesSection } from './sections/ParkCategoriesSection';
import { TrailCategoriesSection } from './sections/TrailCategoriesSection';
import {
  InternalContactSection,
  PricingMembershipsSection,
  ConnectionsSection,
  CommunityConnectionsSection,
  CorporateComplianceSection
} from './sections/MiscellaneousSections';

// Phase 1 — layout dispatcher
import BusinessPaidLayout from './layouts/BusinessPaidLayout';
import BusinessFreeLayout from './layouts/BusinessFreeLayout';
import EventLayout from './layouts/EventLayout';
import ParkLayout from './layouts/ParkLayout';
import TrailLayout from './layouts/TrailLayout';
import { useAuth } from '../../utils/AuthContext';

const PAID_LISTING_TYPES = ['paid', 'paid_founding', 'community_comped'];
function selectLayout(t, lt, spons) {
  if (t === 'EVENT') return EventLayout;
  if (t === 'PARK') return ParkLayout;
  if (t === 'TRAIL') return TrailLayout;
  if (t === 'BUSINESS') return (spons || PAID_LISTING_TYPES.includes(lt)) ? BusinessPaidLayout : BusinessFreeLayout;
  return BusinessFreeLayout;
}

// Lazy load the map component to improve performance
const LocationMap = lazy(() => import('../LocationMap'));
import { LocationMapSkeleton } from '../LocationMap';

export default function POIForm() {
  const { id: paramId } = useParams();
  const navigate = useNavigate();
  const location = useLocation();
  const [poiId, setPoiId] = useState(paramId);
  const [isAutoCreating, setIsAutoCreating] = useState(false);
  const autoCreateInitiated = useRef(false);
  const isEditing = Boolean(poiId);
  const [scroll, scrollTo] = useWindowScroll();
  const [renderError, setRenderError] = useState(null);
  const [navigationBlocked, setNavigationBlocked] = useState(false);

  // Controlled accordion so opening a section keeps the user anchored on that
  // section instead of being dropped to the bottom of the form. In single-open
  // mode, collapsing a tall section above the click (e.g. Hours) removes a large
  // chunk of height, shifting the page — so we re-anchor the opened header into
  // view. Works on desktop and mobile via window.scrollTo.
  const accordionRef = useRef(null);
  const [openSection, setOpenSection] = useState('s1-identity');

  const handleAccordionChange = (value) => {
    setOpenSection(value);
    if (!value) return; // closing the current section — leave scroll alone
    // Wait for the DOM to reflect the new open/closed state (animation is
    // disabled below so layout is final), then bring the opened header to ~90px
    // from the top of the viewport.
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        const wrapper = accordionRef.current;
        if (!wrapper) return;
        // First [data-accordion] in DOM order is the outer accordion root
        // (nested accordions are descendants, so they come later).
        const root = wrapper.querySelector('[data-accordion]');
        if (!root) return;
        // Top-level controls are direct children of an item; nested accordion
        // controls live inside a panel, so this scope excludes them.
        const control = root.querySelector(
          ':scope > * > [data-accordion-control][data-active]'
        );
        if (!control) return;
        const top = window.scrollY + control.getBoundingClientRect().top - 90;
        window.scrollTo({ top: Math.max(top, 0), behavior: 'smooth' });
      });
    });
  };

  // Custom hooks for form management
  const { form, isBusiness, isPark, isTrail, isEvent, isPaidListing, isFreeListing } = usePOIForm();
  const { user } = useAuth();
  const userRole = user?.role || 'user';
  const { loading, handleSubmit, handleDelete, handleSilentDelete, handleAutoCreate } = usePOIHandlers(poiId, isEditing, form, setPoiId);

  // Auto-save hook (only when editing existing POI)
  const { status: saveStatus, lastSaved, errorMsg: saveError, triggerAutoSave } = useAutoSave(form, poiId, isEditing);

  // Simple navigation - no complex draft checks
  const handleNavigation = (path) => {
    navigate(path);
  };

  // Auto-create draft POI when user selects a POI type for new POI
  useEffect(() => {
    if (!paramId && !poiId && !autoCreateInitiated.current && form.values.poi_type && form.values.poi_type !== '') {
      autoCreateInitiated.current = true;
      setIsAutoCreating(true);

      // Immediately call handleAutoCreate instead of using setTimeout to avoid race conditions
      const performAutoCreate = async () => {
        try {
          const draftId = await handleAutoCreate();
          if (draftId) {
            setPoiId(draftId);
            // Update URL to reflect the new POI ID without triggering a full reload
            window.history.replaceState({}, '', `/poi/${draftId}/edit`);
          }
        } catch (error) {
          console.error('Failed to auto-create draft POI:', error);
        } finally {
          setIsAutoCreating(false);
        }
      };

      performAutoCreate();
    }
    // If we have a poiId or paramId, make sure auto-creating is false
    else if ((paramId || poiId) && isAutoCreating) {
      setIsAutoCreating(false);
    }
  }, [paramId, poiId, form.values.poi_type, handleAutoCreate, isAutoCreating]);

  // Early return for render errors
  if (renderError) {
    return (
      <Container size="xl" px={{ base: 'xs', sm: 'md', lg: 'xl' }}>
        <Stack spacing="xl" pb={100}>
          <Alert color="red" title="Render Error">
            <Text>An error occurred while rendering the form: {renderError.message}</Text>
            <Button onClick={() => setRenderError(null)} mt="md">Try Again</Button>
          </Alert>
        </Stack>
      </Container>
    );
  }

  try {
    return (
      <Container size="xl" px={{ base: 'xs', sm: 'md', lg: 'xl' }}>
        <Stack spacing="xl" pb={100}>
          <Box>
            <Group align="center" mb="md">
              <Title order={2} c="deep-purple.7">
                {isEditing ? `Editing: ${form.values.name || 'New POI'}` : 'Create New Point of Interest'}
              </Title>
              {isEditing && (
                <SaveStatus
                  status={saveStatus}
                  lastSaved={lastSaved}
                  errorMsg={saveError}
                  onRetry={triggerAutoSave}
                />
              )}
            </Group>
            <Text size="sm" c="dimmed">Fields marked with * are required</Text>
            {isAutoCreating && (
              <Alert color="blue" mt="sm">
                <Text size="sm">Initializing form with image upload capabilities...</Text>
              </Alert>
            )}
          </Box>

          <form onSubmit={(e) => {
            // Prevent form submission from map interactions
            const clickedElement = e.nativeEvent.submitter;
            if (clickedElement && clickedElement.closest('.leaflet-control-zoom')) {
              e.preventDefault();
              return false;
            }
            form.onSubmit(handleSubmit)(e);
          }}>
            {(() => {
              const Layout = selectLayout(form.values.poi_type, form.values.listing_type, form.values.is_sponsor);
              return (
                <div ref={accordionRef}>
                  <Accordion
                    value={openSection}
                    onChange={handleAccordionChange}
                    chevronPosition="right"
                    variant="separated"
                    transitionDuration={0}
                  >
                    <Layout form={form} userRole={userRole} poiId={poiId} />
                  </Accordion>
                </div>
              );
            })()}
            {false && (<Accordion defaultValue="_disabled" variant="separated">
              {/* Legacy sections retained (hidden) to keep imports alive until cleanup */}
              <Accordion.Item value="core">
                <Accordion.Control>
                  <Group>
                    <Text fw={600}>Core Information</Text>
                    <Badge size="sm" variant="light">Required</Badge>
                  </Group>
                </Accordion.Control>
                <Accordion.Panel>
                  <CoreInformationSection
                    form={form}
                    isBusiness={isBusiness}
                    isPark={isPark}
                    isTrail={isTrail}
                    isEvent={isEvent}
                    isPaidListing={isPaidListing}
                    isFreeListing={isFreeListing}
                    id={poiId}
                  />
                </Accordion.Panel>
              </Accordion.Item>

              {/* Categories & Ideal For Section - NOT for Parks or Trails (they have their own sections) */}
              {!isPark && !isTrail && (
                <Accordion.Item value="categories">
                  <Accordion.Control>
                    <Group>
                      <Text fw={600}>Categories & Target Audience</Text>
                      <Badge size="sm" variant="light">Required</Badge>
                    </Group>
                  </Accordion.Control>
                  <Accordion.Panel>
                    <CategoriesSection
                      form={form}
                      isPaidListing={isPaidListing}
                      isFreeListing={isFreeListing}
                    />
                  </Accordion.Panel>
                </Accordion.Item>
              )}

              {/* Park Categories Section - Things to Do (Parks use this instead of standard categories) */}
              {isPark && (
                <Accordion.Item value="park-categories">
                  <Accordion.Control>
                    <Group>
                      <Text fw={600}>Park Categories & Target Audience</Text>
                      <Badge size="sm" variant="light">Required</Badge>
                    </Group>
                  </Accordion.Control>
                  <Accordion.Panel>
                    <ParkCategoriesSection form={form} />
                  </Accordion.Panel>
                </Accordion.Item>
              )}

              {/* Trail Categories Section - Ideal For (Trails use this instead of standard categories) */}
              {isTrail && (
                <Accordion.Item value="trail-categories">
                  <Accordion.Control>
                    <Group>
                      <Text fw={600}>Trail Categories & Target Audience</Text>
                      <Badge size="sm" variant="light">Required</Badge>
                    </Group>
                  </Accordion.Control>
                  <Accordion.Panel>
                    <TrailCategoriesSection form={form} />
                  </Accordion.Panel>
                </Accordion.Item>
              )}

              {/* Event Venue Section - Link to a venue and copy data */}
              {isEvent && (
                <Accordion.Item value="venue">
                  <Accordion.Control>
                    <Group>
                      <Text fw={600}>Event Venue</Text>
                      <Badge size="sm" variant="light" color="blue">Optional</Badge>
                    </Group>
                  </Accordion.Control>
                  <Accordion.Panel>
                    <EventVenueSection form={form} id={poiId} />
                  </Accordion.Panel>
                </Accordion.Item>
              )}

              {/* Event Status Section (Task 134-136) */}
              {isEvent && (
                <Accordion.Item value="event-status">
                  <Accordion.Control>
                    <Group>
                      <Text fw={600}>Event Status</Text>
                      <Badge size="sm" variant="light" color="blue">Optional</Badge>
                    </Group>
                  </Accordion.Control>
                  <Accordion.Panel>
                    <EventStatusSection form={form} />
                  </Accordion.Panel>
                </Accordion.Item>
              )}

              {/* Event Organizer Section (Task 138) */}
              {isEvent && (
                <Accordion.Item value="event-organizer">
                  <Accordion.Control>
                    <Text fw={600}>Event Organizer</Text>
                  </Accordion.Control>
                  <Accordion.Panel>
                    <EventOrganizerSection form={form} />
                  </Accordion.Panel>
                </Accordion.Item>
              )}

              {/* Event Cost & Ticketing Section (Task 139) */}
              {isEvent && (
                <Accordion.Item value="event-cost">
                  <Accordion.Control>
                    <Text fw={600}>Event Cost & Ticketing</Text>
                  </Accordion.Control>
                  <Accordion.Panel>
                    <EventCostSection form={form} />
                  </Accordion.Panel>
                </Accordion.Item>
              )}

              {/* Event Sponsors Section (Task 140) */}
              {isEvent && (
                <Accordion.Item value="event-sponsors">
                  <Accordion.Control>
                    <Text fw={600}>Event Sponsors</Text>
                  </Accordion.Control>
                  <Accordion.Panel>
                    <EventSponsorsSection form={form} id={poiId} />
                  </Accordion.Panel>
                </Accordion.Item>
              )}

              {/* Location & Parking Section */}
              <Accordion.Item value="location">
                <Accordion.Control>
                  <Group>
                    <Text fw={600}>Location & Parking</Text>
                    <Badge size="sm" variant="light">Required</Badge>
                  </Group>
                </Accordion.Control>
                <Accordion.Panel>
                  <LocationSection
                    form={form}
                    isBusiness={isBusiness}
                    isPark={isPark}
                    isTrail={isTrail}
                    isEvent={isEvent}
                    isFreeListing={isFreeListing}
                    id={poiId}
                  />
                </Accordion.Panel>
              </Accordion.Item>

              {/* Hours of Operation Section - Not for Events */}
              {!isEvent && (
                <Accordion.Item value="hours">
                  <Accordion.Control>
                    <Text fw={600}>Hours of Operation</Text>
                  </Accordion.Control>
                  <Accordion.Panel>
                    <Stack>
                      <HoursSelector
                        value={form.values.hours}
                        onChange={(value) => form.setFieldValue('hours', value)}
                        poiType={form.values.poi_type}
                      />
                    </Stack>
                  </Accordion.Panel>
                </Accordion.Item>
              )}

              {/* Contact & Social Media Section */}
              <Accordion.Item value="contact">
                <Accordion.Control>
                  <Text fw={600}>Contact & Social Media</Text>
                </Accordion.Control>
                <Accordion.Panel>
                  <ContactSection
                    form={form}
                    isEvent={isEvent}
                    isFreeListing={isFreeListing}
                  />
                </Accordion.Panel>
              </Accordion.Item>

              {/* Pricing & Memberships Section - for Parks and Trails */}
              {(isPark || isTrail) && (
                <Accordion.Item value="pricing">
                  <Accordion.Control>
                    <Group>
                      <Text fw={600}>Pricing & Memberships</Text>
                    </Group>
                  </Accordion.Control>
                  <Accordion.Panel>
                    <PricingMembershipsSection form={form} />
                  </Accordion.Panel>
                </Accordion.Item>
              )}

              {/* Internal Contacts Section */}
              <Accordion.Item value="internal">
                <Accordion.Control>
                  <Text fw={600}>Internal Contact Information</Text>
                </Accordion.Control>
                <Accordion.Panel>
                  <InternalContactSection form={form} />
                </Accordion.Panel>
              </Accordion.Item>

              {/* Business Details Section */}
              {isBusiness && (
                <Accordion.Item value="business">
                  <Accordion.Control>
                    <Text fw={600}>Business Details</Text>
                  </Accordion.Control>
                  <Accordion.Panel>
                    <BusinessDetailsSection
                      form={form}
                      isFreeListing={isFreeListing}
                      id={poiId}
                    />
                  </Accordion.Panel>
                </Accordion.Item>
              )}

              {/* Menu & Online Booking Section */}
              {isBusiness && !isFreeListing && (
                <Accordion.Item value="menu">
                  <Accordion.Control>
                    <Text fw={600}>Menu & Online Booking</Text>
                  </Accordion.Control>
                  <Accordion.Panel>
                    <MenuBookingSection form={form} id={poiId} />
                  </Accordion.Panel>
                </Accordion.Item>
              )}

              {/* Gallery Section - PAID Business, Parks, and Trails */}
              {((isBusiness && !isFreeListing) || isPark || isTrail) && (
                <Accordion.Item value="gallery">
                  <Accordion.Control>
                    <Text fw={600}>Gallery</Text>
                  </Accordion.Control>
                  <Accordion.Panel>
                    <BusinessGallerySection form={form} id={poiId} />
                  </Accordion.Panel>
                </Accordion.Item>
              )}

              {/* Facilities & Accessibility Section */}
              <Accordion.Item value="facilities">
                <Accordion.Control>
                  <Text fw={600}>Facilities & Accessibility</Text>
                </Accordion.Control>
                <Accordion.Panel>
                  <FacilitiesSection
                    form={form}
                    isBusiness={isBusiness}
                    isPark={isPark}
                    isTrail={isTrail}
                    isEvent={isEvent}
                    isFreeListing={isFreeListing}
                    id={poiId}
                  />
                </Accordion.Panel>
              </Accordion.Item>

              {/* Public Amenities Section */}
              <Accordion.Item value="amenities">
                <Accordion.Control>
                  <Text fw={600}>{(isPark || isTrail) ? 'Public Restrooms' : 'Public Amenities'}</Text>
                </Accordion.Control>
                <Accordion.Panel>
                  <PublicAmenitiesSection form={form} isPark={isPark} isTrail={isTrail} isEvent={isEvent} isBusiness={isBusiness} isFreeListing={isFreeListing} id={poiId} />
                </Accordion.Panel>
              </Accordion.Item>

              {/* Rentals Section - for Parks and Trails */}
              {(isPark || isTrail) && (
                <Accordion.Item value="rentals">
                  <Accordion.Control>
                    <Text fw={600}>Rentals</Text>
                  </Accordion.Control>
                  <Accordion.Panel>
                    <RentalsSection form={form} id={poiId} />
                  </Accordion.Panel>
                </Accordion.Item>
              )}

              {/* Event Vendors Section */}
              {isEvent && (
                <Accordion.Item value="vendors">
                  <Accordion.Control>
                    <Text fw={600}>Event Vendors</Text>
                  </Accordion.Control>
                  <Accordion.Panel>
                    <EventVendorsSection form={form} id={poiId} />
                  </Accordion.Panel>
                </Accordion.Item>
              )}

              {/* Pet Policy Section */}
              <Accordion.Item value="pets">
                <Accordion.Control>
                  <Text fw={600}>Pet Policy</Text>
                </Accordion.Control>
                <Accordion.Panel>
                  <PetPolicySection form={form} />
                </Accordion.Panel>
              </Accordion.Item>

              {/* Playground Section */}
              {(!isBusiness || !isFreeListing) && (
                <Accordion.Item value="playground">
                  <Accordion.Control>
                    <Text fw={600}>Playground Information</Text>
                  </Accordion.Control>
                  <Accordion.Panel>
                    <PlaygroundSection form={form} id={poiId} />
                  </Accordion.Panel>
                </Accordion.Item>
              )}

              {/* Outdoor Features Section */}
              {(isPark || isTrail) && (
                <Accordion.Item value="outdoor">
                  <Accordion.Control>
                    <Text fw={600}>Outdoor Features</Text>
                  </Accordion.Control>
                  <Accordion.Panel>
                    <OutdoorFeaturesSection form={form} />
                  </Accordion.Panel>
                </Accordion.Item>
              )}

              {/* Hunting & Fishing Section */}
              {(isPark || isTrail) && (
                <Accordion.Item value="hunting">
                  <Accordion.Control>
                    <Text fw={600}>Hunting & Fishing</Text>
                  </Accordion.Control>
                  <Accordion.Panel>
                    <HuntingFishingSection form={form} />
                  </Accordion.Panel>
                </Accordion.Item>
              )}

              {/* Trail Details Section */}
              {isTrail && (
                <Accordion.Item value="trail">
                  <Accordion.Control>
                    <Text fw={600}>Trail Details</Text>
                  </Accordion.Control>
                  <Accordion.Panel>
                    <TrailDetailsSection form={form} id={poiId} />
                  </Accordion.Panel>
                </Accordion.Item>
              )}

              {/* Connections Section */}
              {(isPark || isTrail) && (
                <Accordion.Item value="memberships">
                  <Accordion.Control>
                    <Text fw={600}>Connections</Text>
                  </Accordion.Control>
                  <Accordion.Panel>
                    <ConnectionsSection form={form} isBusiness={isBusiness} isPark={isPark} />
                  </Accordion.Panel>
                </Accordion.Item>
              )}

              {/* Community Connections Section */}
              {((isBusiness && !isFreeListing) || isPark || isTrail || isEvent) && (
                <Accordion.Item value="community">
                  <Accordion.Control>
                    <Text fw={600}>Community Connections</Text>
                  </Accordion.Control>
                  <Accordion.Panel>
                    <CommunityConnectionsSection form={form} />
                  </Accordion.Panel>
                </Accordion.Item>
              )}

              {/* Corporate Compliance Section */}
              <Accordion.Item value="compliance">
                <Accordion.Control>
                  <Text fw={600}>Corporate Compliance</Text>
                </Accordion.Control>
                <Accordion.Panel>
                  <CorporateComplianceSection form={form} />
                </Accordion.Panel>
              </Accordion.Item>

              {/* Dynamic Attributes Section */}
              <Accordion.Item value="attributes">
                <Accordion.Control>
                  <Text fw={600}>Dynamic Attributes</Text>
                </Accordion.Control>
                <Accordion.Panel>
                  <DynamicAttributeForm
                    poiType={form.values.poi_type}
                    value={form.values.dynamic_attributes || {}}
                    onChange={(value) => form.setFieldValue('dynamic_attributes', value)}
                  />
                </Accordion.Panel>
              </Accordion.Item>
            </Accordion>)}

            {/* Form Actions */}
            <FormActions
              form={form}
              loading={loading}
              isEditing={isEditing}
              handleSubmit={handleSubmit}
              handleDelete={handleDelete}
              handleNavigation={handleNavigation}
            />
          </form>
        </Stack>

        {/* Scroll to top button */}
        <Affix position={{ bottom: 20, right: 20 }}>
          <Transition transition="slide-up" mounted={scroll.y > 0}>
            {(transitionStyles) => (
              <Button
                leftSection={<IconChevronUp size={16} />}
                style={transitionStyles}
                onClick={() => scrollTo({ y: 0 })}
              >
                Scroll to top
              </Button>
            )}
          </Transition>
        </Affix>
      </Container>
    );
  } catch (error) {
    console.error('Render error in POIForm:', error);

    // Set the error in state to trigger the error UI
    if (!renderError) {
      setRenderError(error);
    }

    // Fallback render
    return (
      <Container size="xl" px={{ base: 'xs', sm: 'md', lg: 'xl' }}>
        <Stack spacing="xl" pb={100}>
          <Alert color="red" title="Component Error">
            <Text>The form crashed while rendering. Please check the console for details.</Text>
          </Alert>
        </Stack>
      </Container>
    );
  }
}
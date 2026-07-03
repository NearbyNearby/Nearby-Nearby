// Auto-assembled from blog.nearbynearby.com posts. Single source of truth for
// the /updates index, the homepage preview, and the /updates/:slug routes.
// To add a new update: create a page in pages/updates/ and add an entry here.
import RuralSmallTownAmerica from '../pages/updates/RuralSmallTownAmerica';
import RuralAmericaWasNeverBroken from '../pages/updates/RuralAmericaWasNeverBroken';
import LookingAhead2025 from '../pages/updates/LookingAhead2025';
import DayOfServiceVolunteerFair from '../pages/updates/DayOfServiceVolunteerFair';
import JoinsCedGroAccelerator from '../pages/updates/JoinsCedGroAccelerator';
import SharingTheVision from '../pages/updates/SharingTheVision';
import FromInnovationToImpact from '../pages/updates/FromInnovationToImpact';

export const updates = [
  {
    slug: 'rural-and-small-town-america-deserves-better-here-is-what-we-have-been-doing-about-it',
    title: "Rural and Small Town America Deserves Better. Here Is What We Have Been Doing About It.",
    dateLabel: 'June 5, 2026',
    image: '/media/featured-image-rural-and-small-town-america-deserves-better-here-is-what-we-have-been-doing-about-it-01.webp',
    excerpt: "On America’s 250th birthday, we are bringing community, independence, and resilience to the places that have always embodied those values and have too often been left to do it alone.",
    Component: RuralSmallTownAmerica,
  },
  {
    slug: 'rural-america-was-never-broken-its-just-been-overlooked',
    title: "Rural America Was Never Broken—It’s Just Been Overlooked",
    dateLabel: 'February 27, 2025',
    image: '/media/featured-image-rural-america-was-never-broken-its-just-been-overlooked-01.webp',
    excerpt: "Rural America isn’t struggling because it’s incapable—it’s struggling because it’s been made invisible. The businesses, services, and events that fuel small towns aren’t failing due to a lack of quality or effort; they’re facing…",
    Component: RuralAmericaWasNeverBroken,
  },
  {
    slug: 'looking-ahead-through-2025-strengthening-rural-connections-and-opportunities',
    title: "Looking Ahead through 2025: Strengthening Rural Connections and Opportunities",
    dateLabel: 'January 22, 2025',
    image: '/media/featured-image-looking-ahead-through-2025-strengthening-rural-connections-and-opportunities-01.webp',
    excerpt: "In 2025, Nearby Nearby is set to amplify its impact and capabilities, focusing on how we can better serve rural communities—not just as a local discovery platform connecting residents, visitors, and businesses through our…",
    Component: LookingAhead2025,
  },
  {
    slug: 'a-day-of-service-chatham-county-volunteer-fair',
    title: "A Day of Service: Chatham County Volunteer Fair",
    dateLabel: 'September 11, 2024',
    image: '/media/featured-image-a-day-of-service-chatham-county-volunteer-fair-01.webp',
    excerpt: "On September 11th, the Chatham County Community Engagement Task Force hosted a Day of Service, connecting 22 local organizations with over 60 attendees eager to volunteer. The event showcased various ways to serve the community.…",
    Component: DayOfServiceVolunteerFair,
  },
  {
    slug: 'nearby-nearby-joins-the-ced-gro-accelerator-driving-innovation-in-tech',
    title: "Nearby Nearby Joins the CED GRO Accelerator: Driving Innovation in Tech",
    dateLabel: 'May 24, 2024',
    image: '/media/featured-image-nearby-nearby-joins-the-ced-gro-accelerator-driving-innovation-in-tech-01.webp',
    excerpt: "We are thrilled to announce that Nearby Nearby has been selected as one of the eight high-potential startups in the Council for Entrepreneurial Development GRO Accelerator program, an exciting opportunity to drive innovation and…",
    Component: JoinsCedGroAccelerator,
  },
  {
    slug: 'sharing-the-vision-of-nearby-nearby-featured-speaker-at-two-chatham-county-networking-events',
    title: "Sharing the Vision of Nearby Nearby: Featured Speaker at Two Chatham County Networking Events",
    dateLabel: 'May 24, 2024',
    image: '/media/featured-image-sharing-the-vision-of-nearby-nearby-featured-speaker-at-two-chatham-county-networking-events-01.webp',
    excerpt: "This past month, Rhonda Jean, founder and CEO of Nearby Nearby, had the exciting opportunity to serve as the featured speaker at two major networking events in Chatham County.",
    Component: SharingTheVision,
  },
  {
    slug: 'from-innovation-to-impact-the-evolution-of-nearby-nearby-and-our-vision-for-the-future',
    title: "From Innovation to Impact: The Evolution of Nearby Nearby and Our Vision for the Future",
    dateLabel: 'May 24, 2024',
    image: '/media/featured-image-from-innovation-to-impact-the-evolution-of-nearby-nearby-and-our-vision-for-the-future-01.webp',
    excerpt: "For too long, rural businesses, events, and local services have struggled—not because they aren’t valuable, but because they aren’t visible. Information is scattered, word-of-mouth only goes so far, and major platforms overlook…",
    Component: FromInnovationToImpact,
  },
];

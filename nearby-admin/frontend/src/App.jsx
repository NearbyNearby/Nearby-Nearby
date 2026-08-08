import { AppShell, Group, Title, NavLink, Button, Text, ActionIcon, Burger } from '@mantine/core';
import { useDisclosure } from '@mantine/hooks';
import { Routes, Route, Link, useLocation } from 'react-router-dom';
import { IconLogout, IconX, IconMenu2, IconInbox } from '@tabler/icons-react';
import POIList from './components/POIList';
import POIForm from './components/POIForm/POIForm';
import POIMap from './components/POIMap';
import CategoryList from './components/CategoryList';
import CategoryForm from './components/CategoryForm';
import AttributeManager from './components/AttributeManager';
import ParkingLotList from './components/ParkingLotList';
import ParkingLotForm from './components/ParkingLotForm';
import PrimaryTypeList from './components/PrimaryTypeList';
import FormResponses from './components/FormResponses';
import PoiDetailPage from './pages/PoiDetailPage';
import LoginPage from './pages/LoginPage';
import ProtectedRoute from './components/ProtectedRoute';
import { useAuth } from './utils/AuthContext';

function App() {
  const [mobileOpened, { toggle: toggleMobile, close: closeMobile }] = useDisclosure(false);
  const [desktopOpened, { toggle: toggleDesktop }] = useDisclosure(true);
  const location = useLocation();
  const { logout, user } = useAuth();

  // Hide AppShell for public detail page
  if (location.pathname.startsWith('/poi/detail')) {
    return (
       <Routes>
         <Route path="/poi/detail/:id" element={<PoiDetailPage />} />
       </Routes>
    )
  }

  // Show login page if not authenticated
  if (location.pathname === '/login') {
    return (
      <Routes>
        <Route path="/login" element={<LoginPage />} />
      </Routes>
    );
  }

  return (
    <ProtectedRoute>
      <AppShell
        header={{ height: 60 }}
        navbar={{
          width: { base: '100%', sm: 260, md: 300 },
          breakpoint: 'sm',
          collapsed: { mobile: !mobileOpened, desktop: !desktopOpened },
        }}
        padding="md"
      >
        <AppShell.Header>
          <Group h="100%" px="md" justify="space-between" wrap="nowrap">
            <Group gap="sm" wrap="nowrap">
              <Burger opened={mobileOpened} onClick={toggleMobile} hiddenFrom="sm" size="sm" aria-label="Toggle navigation" />
              <Burger opened={desktopOpened} onClick={toggleDesktop} visibleFrom="sm" size="sm" aria-label="Toggle navigation" />
              <Title order={4} component={Link} to="/" style={{ textDecoration: 'none', color: 'inherit', whiteSpace: 'nowrap' }}>
                Nearby Admin
              </Title>
            </Group>
            <Group gap="xs" wrap="nowrap">
              {user && (
                <Text size="sm" c="dimmed" visibleFrom="sm">
                  {user.email}
                </Text>
              )}
              <Button
                variant="subtle"
                size="sm"
                onClick={logout}
                leftSection={<IconLogout size="1rem" />}
              >
                <Text span visibleFrom="xs">Logout</Text>
              </Button>
            </Group>
          </Group>
        </AppShell.Header>

        <AppShell.Navbar p="md">
          <Group justify="space-between" mb="md" hiddenFrom="sm">
            <Text fw={600} size="sm" c="dimmed">Menu</Text>
            <ActionIcon variant="subtle" onClick={closeMobile} size="md" aria-label="Close menu">
              <IconX size={18} />
            </ActionIcon>
          </Group>
          <NavLink label="Points of Interest" component={Link} to="/" onClick={closeMobile} />
          <NavLink label="POI Map" component={Link} to="/map" onClick={closeMobile} />
          <NavLink label="Manage Categories" component={Link} to="/categories" onClick={closeMobile} />
          <NavLink label="Manage Parking Lots" component={Link} to="/parking-lots" onClick={closeMobile} />
          <NavLink label="Manage Primary Types" component={Link} to="/primary-types" onClick={closeMobile} />
          <NavLink label="Manage Attributes" component={Link} to="/attributes" onClick={closeMobile} />
          <NavLink
            label="Form Responses"
            component={Link}
            to="/form-responses"
            onClick={closeMobile}
            leftSection={<IconInbox size={18} />}
          />
          <NavLink label="Create New POI" component={Link} to="/poi/new" onClick={closeMobile} />
        </AppShell.Navbar>

        <AppShell.Main>
          <Routes>
            <Route path="/login" element={<LoginPage />} />
            <Route path="/" element={<POIList />} />
            <Route path="/map" element={<POIMap />} />
            <Route path="/poi/new" element={<POIForm />} />
            <Route path="/poi/:id/edit" element={<POIForm />} />
            <Route path="/categories" element={<CategoryList />} />
            <Route path="/parking-lots" element={<ParkingLotList />} />
            <Route path="/parking-lot/new" element={<ParkingLotForm />} />
            <Route path="/parking-lot/:id/edit" element={<ParkingLotForm />} />
            <Route path="/primary-types" element={<PrimaryTypeList />} />
            <Route path="/category/new" element={<CategoryForm />} />
            <Route path="/category/:id/edit" element={<CategoryForm />} />
            <Route path="/attributes" element={<AttributeManager />} />
            <Route path="/form-responses" element={<FormResponses />} />
          </Routes>
        </AppShell.Main>
      </AppShell>
    </ProtectedRoute>
  );
}

export default App;
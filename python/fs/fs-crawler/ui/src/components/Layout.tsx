import React, { useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import {
  AppBar,
  Box,
  CssBaseline,
  Drawer,
  IconButton,
  List,
  ListItem,
  ListItemButton,
  ListItemIcon,
  ListItemText,
  Toolbar,
  Typography,
  Chip,
  Tooltip,
  Divider,
  Avatar,
  Badge,
} from '@mui/material'
import {
  Menu as MenuIcon,
  Dashboard as DashboardIcon,
  Folder as FolderIcon,
  Scanner as ScannerIcon,
  Analytics as AnalyticsIcon,
  Brightness4 as DarkModeIcon,
  Brightness7 as LightModeIcon,
  Circle as CircleIcon,
  Storage as StorageIcon,
  Settings as SettingsIcon,
} from '@mui/icons-material'
import { useTheme } from '@/contexts/ThemeContext'
import { useSystemStatus, useHealth } from '@/hooks/useApi'

const drawerWidth = 280

interface LayoutProps {
  children: React.ReactNode
}

const Layout: React.FC<LayoutProps> = ({ children }) => {
  const [mobileOpen, setMobileOpen] = useState(false)
  const { mode, toggleTheme } = useTheme()
  const location = useLocation()
  const navigate = useNavigate()

  const { data: systemStatus } = useSystemStatus()
  const { data: health } = useHealth()

  const handleDrawerToggle = () => {
    setMobileOpen(!mobileOpen)
  }

  const menuItems = [
    { text: 'Dashboard', icon: <DashboardIcon />, path: '/' },
    { text: 'Libraries', icon: <FolderIcon />, path: '/libraries' },
    { text: 'Scanning', icon: <ScannerIcon />, path: '/scanning' },
    { text: 'Statistics', icon: <AnalyticsIcon />, path: '/statistics' },
  ]

  const getStatusColor = (status?: string) => {
    switch (status) {
      case 'running':
      case 'healthy':
      case 'connected':
        return 'success'
      case 'shutting_down':
        return 'warning'
      case 'error':
      case 'unhealthy':
      case 'disconnected':
        return 'error'
      default:
        return 'default'
    }
  }

  const drawer = (
    <Box sx={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
      <Box sx={{ p: 3, pb: 2, display: 'flex', alignItems: 'center', gap: 2 }}>
        <Avatar sx={{ bgcolor: 'primary.main', width: 48, height: 48 }}>
          <StorageIcon />
        </Avatar>
        <Box>
          <Typography variant="h6" component="div" sx={{ fontWeight: 600 }}>
            FS Crawler
          </Typography>
          <Typography variant="caption" color="text.secondary">
            Media Metadata Service
          </Typography>
        </Box>
      </Box>

      <Divider />

      <List sx={{ py: 1 }}>
        {menuItems.map((item) => (
          <ListItem key={item.text} disablePadding>
            <ListItemButton
              selected={location.pathname === item.path}
              onClick={() => navigate(item.path)}
              sx={{
                mx: 1.5,
                borderRadius: 2,
                mb: 0.5,
                '&.Mui-selected': {
                  backgroundColor: 'primary.main',
                  color: 'primary.contrastText',
                  '&:hover': {
                    backgroundColor: 'primary.dark',
                  },
                },
              }}
            >
              <ListItemIcon sx={{
                minWidth: 40,
                color: location.pathname === item.path ? 'primary.contrastText' : 'inherit'
              }}>
                {item.icon}
              </ListItemIcon>
              <ListItemText
                primary={item.text}
                sx={{
                  '& .MuiListItemText-primary': {
                    fontWeight: 500,
                  }
                }}
              />
            </ListItemButton>
          </ListItem>
        ))}
      </List>

      <Box sx={{ mt: 'auto', p: 2, pt: 0 }}>
        <Divider sx={{ mb: 2 }} />
        <Box sx={{ display: 'flex', justifyContent: 'center' }}>
          <IconButton
            color="inherit"
            onClick={toggleTheme}
            sx={{
              backgroundColor: 'action.hover',
              borderRadius: '50%',
              width: 40,
              height: 40,
            }}
          >
            {mode === 'dark' ? <LightModeIcon /> : <DarkModeIcon />}
          </IconButton>
        </Box>
      </Box>
    </Box>
  )

  return (
    <Box sx={{ display: 'flex' }}>
      <CssBaseline />
      <AppBar
        position="fixed"
        sx={{
          width: { sm: `calc(100% - ${drawerWidth}px)` },
          ml: { sm: `${drawerWidth}px` },
          backgroundColor: 'background.paper',
          color: 'text.primary',
          zIndex: (theme) => theme.zIndex.drawer - 1,
        }}
      >
        <Toolbar sx={{ pr: '24px' }}>
          <IconButton
            color="inherit"
            aria-label="open drawer"
            edge="start"
            onClick={handleDrawerToggle}
            sx={{ mr: 2, display: { sm: 'none' } }}
          >
            <MenuIcon />
          </IconButton>

          <Typography
            variant="h6"
            noWrap
            component="div"
            sx={{
              flexGrow: 1,
              fontWeight: 600,
              color: 'text.primary',
            }}
          >
            {menuItems.find(item => item.path === location.pathname)?.text || 'Dashboard'}
          </Typography>

          {/* System Status Indicators */}
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
            {systemStatus && (
              <Tooltip title={`System: ${systemStatus.system_status}`}>
                <Badge
                  variant="dot"
                  color={getStatusColor(systemStatus.system_status) as any}
                  overlap="circular"
                >
                  <Chip
                    icon={<CircleIcon />}
                    label={systemStatus.system_status}
                    size="small"
                    color={getStatusColor(systemStatus.system_status)}
                    variant="outlined"
                    sx={{
                      height: 32,
                      '& .MuiChip-icon': {
                        marginLeft: 0.5,
                      }
                    }}
                  />
                </Badge>
              </Tooltip>
            )}

            {health && (
              <Tooltip title="Database Health">
                <Chip
                  icon={<CircleIcon />}
                  label={health.status}
                  size="small"
                  color={getStatusColor(health.status)}
                  variant="outlined"
                  sx={{
                    height: 32,
                    '& .MuiChip-icon': {
                      marginLeft: 0.5,
                    }
                  }}
                />
              </Tooltip>
            )}

            {systemStatus && systemStatus.active_scans > 0 && (
              <Tooltip title={`${systemStatus.active_scans} active scans`}>
                <Chip
                  icon={<ScannerIcon className="pulse" />}
                  label={systemStatus.active_scans}
                  size="small"
                  color="info"
                  sx={{
                    height: 32,
                    '& .MuiChip-icon': {
                      marginLeft: 0.5,
                    }
                  }}
                />
              </Tooltip>
            )}
          </Box>
        </Toolbar>
      </AppBar>

      <Box
        component="nav"
        sx={{
          width: { sm: drawerWidth },
          flexShrink: { sm: 0 },
          '& .MuiDrawer-paper': {
            width: drawerWidth,
            boxSizing: 'border-box',
            backgroundColor: 'background.default',
            color: 'text.primary',
          },
        }}
        aria-label="navigation menu"
      >
        <Drawer
          variant="temporary"
          open={mobileOpen}
          onClose={handleDrawerToggle}
          ModalProps={{
            keepMounted: true, // Better open performance on mobile.
          }}
          sx={{
            display: { xs: 'block', sm: 'none' },
            '& .MuiDrawer-paper': {
              boxSizing: 'border-box',
              width: drawerWidth,
              backgroundColor: 'background.paper',
              color: 'text.primary',
            },
          }}
        >
          {drawer}
        </Drawer>
        <Drawer
          variant="permanent"
          sx={{
            display: { xs: 'none', sm: 'block' },
            '& .MuiDrawer-paper': {
              boxSizing: 'border-box',
              width: drawerWidth,
              borderRight: 'none',
              backgroundColor: 'background.paper',
              color: 'text.primary',
            },
          }}
          open
        >
          {drawer}
        </Drawer>
      </Box>

      <Box
        component="main"
        sx={{
          flexGrow: 1,
          p: 3,
          width: { sm: `calc(100% - ${drawerWidth}px)` },
          backgroundColor: 'background.default',
          minHeight: '100vh',
          mt: '64px', // Account for fixed AppBar
        }}
      >
        {children}
      </Box>
    </Box>
  )
}

export default Layout
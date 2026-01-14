import { useState } from 'react';
import {
  Box,
  Card,
  CardContent,
  Typography,
  Checkbox,
  Accordion,
  AccordionSummary,
  AccordionDetails,
  LinearProgress,
  Stack,
  IconButton,
  TextField,
  Button,
  Chip,
} from '@mui/material';
import {
  ExpandMore,
  Add as AddIcon,
  Delete as DeleteIcon,
  CheckCircle,
} from '@mui/icons-material';
import type { ChecklistCategory, ChecklistItem } from '../types/domain';

interface TripChecklistProps {
  checklist: ChecklistCategory[];
  onUpdate: (checklist: ChecklistCategory[]) => void;
  readOnly?: boolean;
}

const DEFAULT_CHECKLIST: ChecklistCategory[] = [
  {
    id: 'documents',
    name: 'Travel Documents & Money',
    items: [
      { id: 'passport', label: 'Passport / Visa', checked: false },
      { id: 'insurance', label: 'Travel Insurance', checked: false },
      { id: 'cards', label: 'Cash / Credit Cards', checked: false },
      { id: 'license', label: "Driver's License / ID", checked: false },
      {
        id: 'tickets',
        label: 'Flight Tickets / Boarding Pass',
        checked: false,
      },
      {
        id: 'reservations',
        label: 'Hotel & Trip Reservations',
        checked: false,
      },
      { id: 'emergency', label: 'Emergency Contacts', checked: false },
    ],
  },
  {
    id: 'clothing',
    name: 'Clothing & Personal Items',
    items: [
      {
        id: 'clothing',
        label: 'Clothing appropriate for destination/weather',
        checked: false,
      },
      {
        id: 'shoes',
        label: 'Comfortable shoes / flip-flops / sandals',
        checked: false,
      },
      { id: 'pajamas', label: 'Pajamas / sleepwear', checked: false },
      { id: 'swimwear', label: 'Swimwear (if needed)', checked: false },
      {
        id: 'sunprotection',
        label: 'Sunglasses / Hat / Sun Protection',
        checked: false,
      },
      {
        id: 'rain',
        label: 'Umbrella / Raincoat (if needed)',
        checked: false,
      },
    ],
  },
  {
    id: 'health',
    name: 'Health & Safety',
    items: [
      {
        id: 'prescriptions',
        label: 'Prescription medications',
        checked: false,
      },
      {
        id: 'otc',
        label:
          'Over-the-counter medications (painkillers, antihistamines, etc.)',
        checked: false,
      },
      {
        id: 'firstaid',
        label: 'First Aid items (band-aids, antiseptic wipes)',
        checked: false,
      },
      {
        id: 'sanitizer',
        label: 'Face masks / hand sanitizer',
        checked: false,
      },
      {
        id: 'vaccination',
        label: 'Vaccination certificates (if required)',
        checked: false,
      },
    ],
  },
  {
    id: 'electronics',
    name: 'Electronics & Accessories',
    items: [
      { id: 'phone', label: 'Mobile phone & charger', checked: false },
      { id: 'laptop', label: 'Laptop / Tablet & charger', checked: false },
      { id: 'powerbank', label: 'Power bank', checked: false },
      { id: 'adapters', label: 'Travel adapters / converters', checked: false },
      { id: 'headphones', label: 'Headphones / Earplugs', checked: false },
      { id: 'camera', label: 'Camera & accessories', checked: false },
    ],
  },
  {
    id: 'toiletries',
    name: 'Toiletries & Personal Care',
    items: [
      { id: 'toothbrush', label: 'Toothbrush & Toothpaste', checked: false },
      { id: 'shampoo', label: 'Shampoo / Conditioner', checked: false },
      { id: 'soap', label: 'Soap / Body Wash', checked: false },
      { id: 'deodorant', label: 'Deodorant', checked: false },
      { id: 'hairbrush', label: 'Hairbrush / Comb', checked: false },
      { id: 'razor', label: 'Razor / Shaving kit', checked: false },
      { id: 'skincare', label: 'Skincare products / lotion', checked: false },
      { id: 'makeup', label: 'Makeup / Cosmetics (if needed)', checked: false },
    ],
  },
  {
    id: 'comfort',
    name: 'Travel Comfort & Extras',
    items: [
      { id: 'snacks', label: 'Snacks / Water bottle', checked: false },
      { id: 'pillow', label: 'Travel pillow / blanket', checked: false },
      {
        id: 'entertainment',
        label: 'Books / Magazines / Entertainment',
        checked: false,
      },
      {
        id: 'backpack',
        label: 'Small backpack / carry-on bag',
        checked: false,
      },
      { id: 'maps', label: 'Maps / Travel guides', checked: false },
      {
        id: 'sportsgear',
        label: 'Sports / activity gear (hiking, snorkeling, skiing)',
        checked: false,
      },
      { id: 'gifts', label: 'Gifts or souvenirs', checked: false },
      {
        id: 'language',
        label: 'Language guide / translation app',
        checked: false,
      },
    ],
  },
];

export default function TripChecklist({
  checklist,
  onUpdate,
  readOnly = false,
}: TripChecklistProps) {
  const [newItemText, setNewItemText] = useState<Record<string, string>>({});
  const [expandedCategories, setExpandedCategories] = useState<string[]>([
    'documents',
  ]);

  // Initialize with default checklist if empty
  const currentChecklist =
    checklist && checklist.length > 0 ? checklist : DEFAULT_CHECKLIST;

  const handleToggleCategory = (categoryId: string) => {
    setExpandedCategories((prev) =>
      prev.includes(categoryId)
        ? prev.filter((id) => id !== categoryId)
        : [...prev, categoryId]
    );
  };

  const handleToggleItem = (categoryId: string, itemId: string) => {
    const updated = currentChecklist.map((category) => {
      if (category.id === categoryId) {
        return {
          ...category,
          items: category.items.map((item) =>
            item.id === itemId ? { ...item, checked: !item.checked } : item
          ),
        };
      }
      return category;
    });
    onUpdate(updated);
  };

  const handleAddItem = (categoryId: string) => {
    const text = newItemText[categoryId]?.trim();
    if (!text) return;

    const updated = currentChecklist.map((category) => {
      if (category.id === categoryId) {
        const newItem: ChecklistItem = {
          id: `custom-${Date.now()}`,
          label: text,
          checked: false,
          isCustom: true,
        };
        return {
          ...category,
          items: [...category.items, newItem],
        };
      }
      return category;
    });

    onUpdate(updated);
    setNewItemText({ ...newItemText, [categoryId]: '' });
  };

  const handleDeleteItem = (categoryId: string, itemId: string) => {
    const updated = currentChecklist.map((category) => {
      if (category.id === categoryId) {
        return {
          ...category,
          items: category.items.filter((item) => item.id !== itemId),
        };
      }
      return category;
    });
    onUpdate(updated);
  };

  const calculateProgress = (category: ChecklistCategory) => {
    const total = category.items.length;
    const checked = category.items.filter((item) => item.checked).length;
    return total > 0 ? (checked / total) * 100 : 0;
  };

  const calculateOverallProgress = () => {
    const totalItems = currentChecklist.reduce(
      (sum, cat) => sum + cat.items.length,
      0
    );
    const checkedItems = currentChecklist.reduce(
      (sum, cat) => sum + cat.items.filter((item) => item.checked).length,
      0
    );
    return totalItems > 0 ? (checkedItems / totalItems) * 100 : 0;
  };

  const overallProgress = calculateOverallProgress();
  const totalChecked = currentChecklist.reduce(
    (sum, cat) => sum + cat.items.filter((item) => item.checked).length,
    0
  );
  const totalItems = currentChecklist.reduce(
    (sum, cat) => sum + cat.items.length,
    0
  );

  return (
    <Card sx={{ height: '100%' }}>
      <CardContent>
        <Stack spacing={2}>
          {/* Header */}
          <Box>
            <Stack
              direction="row"
              justifyContent="space-between"
              alignItems="center"
              mb={1}
            >
              <Typography variant="h6" fontWeight={600}>
                ✓ Trip Preparation Checklist
              </Typography>
              <Chip
                icon={<CheckCircle />}
                label={`${totalChecked} / ${totalItems}`}
                color={overallProgress === 100 ? 'success' : 'default'}
                size="small"
              />
            </Stack>

            {/* Overall Progress */}
            <Box>
              <Stack
                direction="row"
                justifyContent="space-between"
                alignItems="center"
                mb={0.5}
              >
                <Typography variant="caption" color="text.secondary">
                  Overall Progress
                </Typography>
                <Typography
                  variant="caption"
                  color="text.secondary"
                  fontWeight={600}
                >
                  {overallProgress.toFixed(0)}%
                </Typography>
              </Stack>
              <LinearProgress
                variant="determinate"
                value={overallProgress}
                sx={{ height: 8, borderRadius: 1 }}
              />
            </Box>
          </Box>

          {/* Categories */}
          {currentChecklist.map((category) => {
            const progress = calculateProgress(category);
            const checkedCount = category.items.filter(
              (item) => item.checked
            ).length;
            const isExpanded = expandedCategories.includes(category.id);

            return (
              <Accordion
                key={category.id}
                expanded={isExpanded}
                onChange={() => handleToggleCategory(category.id)}
                elevation={0}
                sx={{ border: '1px solid', borderColor: 'divider' }}
              >
                <AccordionSummary expandIcon={<ExpandMore />}>
                  <Box sx={{ width: '100%', pr: 2 }}>
                    <Stack
                      direction="row"
                      justifyContent="space-between"
                      alignItems="center"
                      mb={1}
                    >
                      <Typography variant="subtitle2" fontWeight={600}>
                        {category.name}
                      </Typography>
                      <Chip
                        label={`${checkedCount}/${category.items.length}`}
                        size="small"
                        color={progress === 100 ? 'success' : 'default'}
                        sx={{ minWidth: 60 }}
                      />
                    </Stack>
                    <LinearProgress
                      variant="determinate"
                      value={progress}
                      sx={{ height: 4, borderRadius: 1 }}
                    />
                  </Box>
                </AccordionSummary>

                <AccordionDetails>
                  <Stack spacing={1}>
                    {/* Items List */}
                    {category.items.map((item) => (
                      <Stack
                        key={item.id}
                        direction="row"
                        alignItems="center"
                        spacing={1}
                        sx={{
                          '&:hover .delete-btn': {
                            opacity: item.isCustom ? 1 : 0,
                          },
                        }}
                      >
                        <Checkbox
                          checked={item.checked}
                          onChange={() =>
                            handleToggleItem(category.id, item.id)
                          }
                          size="small"
                          disabled={readOnly}
                        />
                        <Typography
                          variant="body2"
                          sx={{
                            flex: 1,
                            textDecoration: item.checked
                              ? 'line-through'
                              : 'none',
                            color: item.checked
                              ? 'text.secondary'
                              : 'text.primary',
                          }}
                        >
                          {item.label}
                        </Typography>
                        {item.isCustom && !readOnly && (
                          <IconButton
                            className="delete-btn"
                            size="small"
                            onClick={() =>
                              handleDeleteItem(category.id, item.id)
                            }
                            sx={{ opacity: 0, transition: 'opacity 0.2s' }}
                          >
                            <DeleteIcon fontSize="small" />
                          </IconButton>
                        )}
                      </Stack>
                    ))}
                    {/* Add Custom Item */}
                    {!readOnly && (
                      <Stack direction="row" spacing={1} mt={1}>
                        <TextField
                          size="small"
                          placeholder="Add custom item..."
                          value={newItemText[category.id] || ''}
                          onChange={(e) =>
                            setNewItemText({
                              ...newItemText,
                              [category.id]: e.target.value,
                            })
                          }
                          onKeyPress={(e) => {
                            if (e.key === 'Enter') {
                              handleAddItem(category.id);
                            }
                          }}
                          fullWidth
                        />
                        <Button
                          size="small"
                          startIcon={<AddIcon />}
                          onClick={() => handleAddItem(category.id)}
                          disabled={!newItemText[category.id]?.trim()}
                        >
                          Add
                        </Button>
                      </Stack>
                    )}{' '}
                  </Stack>
                </AccordionDetails>
              </Accordion>
            );
          })}
        </Stack>
      </CardContent>
    </Card>
  );
}

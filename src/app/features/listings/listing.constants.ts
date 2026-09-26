import { ListingCondition, ListingStatus } from './listing.models';

export const listingConditionOptions: Array<{ value: ListingCondition; label: string }> = [
  { value: 'New', label: 'New' },
  { value: 'Used', label: 'Used' }
];

export const listingCityOptions = [
  'Kyiv',
  'Kharkiv',
  'Odesa',
  'Dnipro',
  'Lviv',
  'Zaporizhzhia',
  'Vinnytsia',
  'Ivano-Frankivsk',
  'Poltava',
  'Chernihiv'
] as const;

export const listingSortOptions = [
  { value: 'newest', label: 'Newest first' },
  { value: 'oldest', label: 'Oldest first' },
  { value: 'price-low', label: 'Cheapest first' },
  { value: 'price-high', label: 'Most expensive first' }
] as const;

export const listingConditionFilterOptions = [
  { value: 'all', label: 'Any condition' },
  ...listingConditionOptions
] as const;

export function formatListingCondition(condition: ListingCondition): string {
  return condition === 'New' ? 'New' : 'Used';
}

export function formatListingStatus(status: ListingStatus): string {
  switch (status) {
    case 'Published':
      return 'Published';
    case 'ReadyToShip':
      return 'Ready to ship';
    case 'InDelivery':
      return 'In delivery';
    case 'Sold':
      return 'Sold';
    case 'Arrived':
      return 'Arrived';
    case 'Active':
      return 'Published';
    case 'Draft':
      return 'Draft';
    case 'Archived':
      return 'Archived';
    case 'Inactive':
      return 'Inactive';
    case 'Blocked':
      return 'Blocked';
    default:
      return 'Published';
  }
}

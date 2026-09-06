import csv
import hashlib
import os

input_csv = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', 'etsy.csv'))
temp_csv = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', 'etsy_temp.csv'))

print(f"Reading from: {input_csv}")

def compute_quantity(availability: str, product_id: str, index: int) -> int:
    avail = (availability or '').strip()
    if avail.lower() in ('outofstock', 'out of stock', 'false', '0'):
        return 0
    
    # Deterministic pseudo-randomness based on product_id or index
    seed_str = f"{product_id}_{index}_{avail}"
    hash_val = int(hashlib.md5(seed_str.encode('utf-8')).hexdigest()[:8], 16)
    
    if avail.lower() in ('limitedstock', 'limited stock'):
        # 1 or 2 units
        return (hash_val % 2) + 1
    
    # InStock: realistic artisan distribution [3 to 50]
    bucket = hash_val % 100
    if bucket < 15:
        # Small batch artisan items: 3 - 5 units
        return 3 + (hash_val % 3)
    elif bucket < 60:
        # Standard stock: 6 - 15 units
        return 6 + (hash_val % 10)
    elif bucket < 90:
        # Established stock: 16 - 35 units
        return 16 + (hash_val % 20)
    else:
        # Abundant materials / supplies: 36 - 50 units
        return 36 + (hash_val % 15)

with open(input_csv, 'r', encoding='utf-8', errors='ignore') as infile:
    reader = csv.reader(infile)
    header = next(reader)
    
    # Locate column indices
    avail_idx = header.index('availability') if 'availability' in header else -1
    pid_idx = header.index('product_id') if 'product_id' in header else -1
    
    # Add available_quantity to header if not already present
    if 'available_quantity' in header:
        qty_idx = header.index('available_quantity')
        new_header = header
    else:
        qty_idx = len(header)
        new_header = header + ['available_quantity']
    
    rows_written = 0
    stats = {'zero': 0, 'limited_1_2': 0, 'in_stock_3_9': 0, 'abundant_10_plus': 0}
    
    with open(temp_csv, 'w', encoding='utf-8', newline='') as outfile:
        writer = csv.writer(outfile)
        writer.writerow(new_header)
        
        for idx, row in enumerate(reader):
            avail_val = row[avail_idx] if avail_idx >= 0 and avail_idx < len(row) else 'InStock'
            pid_val = row[pid_idx] if pid_idx >= 0 and pid_idx < len(row) else str(idx)
            
            qty = compute_quantity(avail_val, pid_val, idx)
            
            if qty == 0:
                stats['zero'] += 1
            elif qty <= 2:
                stats['limited_1_2'] += 1
            elif qty <= 9:
                stats['in_stock_3_9'] += 1
            else:
                stats['abundant_10_plus'] += 1
            
            if qty_idx < len(row):
                row[qty_idx] = str(qty)
                writer.writerow(row)
            else:
                writer.writerow(row + [str(qty)])
            
            rows_written += 1

print(f"Total rows processed and written: {rows_written}")
print("Inventory Statistics:")
print(f"  Out of Stock (0 units): {stats['zero']}")
print(f"  Limited Stock (1-2 units): {stats['limited_1_2']}")
print(f"  In Stock (3-9 units): {stats['in_stock_3_9']}")
print(f"  Abundant Stock (10-50 units): {stats['abundant_10_plus']}")

import shutil

# Replace original file atomically
if os.path.exists(temp_csv) and rows_written == 30000:
    shutil.copyfile(temp_csv, input_csv)
    os.remove(temp_csv)
    print(f"Successfully updated {input_csv} with available_quantity column!")
else:
    print("Warning: verification check failed, original file kept unchanged.")

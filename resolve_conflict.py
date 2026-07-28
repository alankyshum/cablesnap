with open('hooks/useSessionActions.ts', 'r') as f:
    content = f.read()

start_marker = '<<<<<<< conflict 1 of 1'
end_marker = '>>>>>>> conflict 1 of 1 ends'

if start_marker in content and end_marker in content:
    before, rest = content.split(start_marker, 1)
    conflict_block, after = rest.split(end_marker, 1)
    
    parts = conflict_block.split('+++++++ xsxlsqwl', 1)
    if len(parts) == 2:
        xsxl_lines = parts[1].splitlines()
        xsxl_code = '\n'.join(xsxl_lines[1:])
        new_content = before + xsxl_code + '\n' + after
        with open('hooks/useSessionActions.ts', 'w') as f:
            f.write(new_content)
        print('Conflict successfully resolved!')
    else:
        print('Error: +++++++ xsxlsqwl marker not found in conflict block')
else:
    print('Error: Conflict markers not found')

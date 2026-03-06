# React Component Pattern

When generating a React function component, follow these standard practices to ensure it is robust, performant, and maintainable.

## 1. Functional Component Setup
Always use Arrow Functions for defining components, explicitly type/destructure props, and use default exports unless grouped in an index.

```jsx
import React, { useState, useEffect } from 'react';
import PropTypes from 'prop-types';

const UserProfile = ({ user, onSave }) => {
  const [isEditing, setIsEditing] = useState(false);
  const [formData, setFormData] = useState({ name: user.name });

  // Handle derived state or side-effects
  useEffect(() => {
    setFormData({ name: user.name });
  }, [user]);

  const handleChange = (e) => {
    setFormData({ ...formData, [e.target.name]: e.target.value });
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    onSave(formData);
    setIsEditing(false);
  };

  if (!user) {
    return <div>Loading...</div>;
  }

  return (
    <div className="user-profile">
      {/* Component JSX */}
    </div>
  );
};

UserProfile.propTypes = {
  user: PropTypes.shape({
    id: PropTypes.string,
    name: PropTypes.string
  }).isRequired,
  onSave: PropTypes.func.isRequired
};

export default UserProfile;
```

## 2. State Management Rules
1. **Colocate State**: Keep state as close as possible to where it is used.
2. **Minimal State**: Do not put data in state if it can be derived from props or existing state during the render cycle.
3. **Immutability**: Always treat state arrays and objects as read-only. Use spreads `...` or `map`/`filter` to update them.

## 3. Side Effects
When using `useEffect`:
- Define functions that do not depend on component scope *outside* the component.
- Always include a complete dependency array.
- Clean up any subscriptions or intervals in the cleanup return function.

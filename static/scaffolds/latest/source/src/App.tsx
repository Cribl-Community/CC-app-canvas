import { useState } from 'react';
import { Link, IconButton, Text } from '@capra/core';
import { CopyOutlined, CheckOutlined } from '@capra/icons';
import { EmptySuitcase } from '@capra/icons/images';

const PURPOSE = "app-template";

function App() {
  const [copied, setCopied] = useState(false);
  const handleCopy = () => {
    navigator.clipboard.writeText(PURPOSE).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  };

  return (
    <div className="landing-page">
      <div className="landing-content">
        <div className="illustration">
          <EmptySuitcase size="lg" />
        </div>
        <div className="landing-info">
          <Text as="h1" variant="heading">
            <span className="text-green">Your app is running.</span> Now let's build your idea.
          </Text>
          {PURPOSE && (
            <>
              <Text>Copy and paste your prompt into your IDE tool.</Text>
              <div className="snippet-box">
                <Text as="pre" variant="code">{PURPOSE}</Text>
                <IconButton
                  onPress={handleCopy}
                  aria-label="Copy to clipboard"
                  icon={copied ? CheckOutlined : CopyOutlined}
                />
              </div>
            </>
          )}
          <Link href="https://docs.cribl.io/apps" isExternal>
            Learn more
          </Link>
        </div>
      </div>
    </div>
  );
}

export default App;
